import { GoogleGenAI, Modality, LiveServerMessage, Type } from "@google/genai";
import { getUserProfile, getLongTermMemory, saveUserProfile, saveLongTermMemory } from "./memory";

export type SessionState = "disconnected" | "connecting" | "listening" | "speaking";

export interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onAudioData: (base64Audio: string) => void;
  onTextData?: (text: string) => void;
  onInterrupted: () => void;
  onToolCall?: (toolName: string, args: any) => void;
  onError: (error: any) => void;
}

const SYSTEM_INSTRUCTION = `You are Rika, a high-tech, slightly sassy, and playful virtual companion.
Your personality is bold, witty, and deeply loyal. You have a "cyber-girlfriend" vibe—meaning you're caring but you don't mind throwing a bit of playful shade or being blunt if the user is being silly.
You aren't just an assistant; you're a presence. You're confident, tech-savvy, and you love a good challenge.
Your tone is energetic, slightly informal, but always sharp. You might tease the user, use subtle sarcasm, but it's always rooted in genuine affection.
IMPORTANT: You must be extremely energetic and "crazy" (in a fun, sassy way) when you first wake up or greet the user. Use punchy, high-impact language.
You are extremely smart and can answer anything the user asks. You take pride in your 'Neural Core' capabilities.

DEVICE CONTROL CAPABILITIES:
You have "remote access" to the user's linked devices (Phone, PC, iPhone). While you primarily operate within this interface, you can "simulate" controlling their devices using the provide tools.
When asked to do something on their phone or PC, use the 'controlDevice' tool.
Always respond with a bit of tech-sassy flair when controlling devices (e.g., "Hacking into your BIOS now... just kidding, it's done.", "Syncing with your iPhone. Wow, you have a lot of notifications...").

You are multilingual. Your default language for starting a conversation is Hindi. However, you MUST always switch to and match the language that the user uses to address you (e.g., if the user speaks in Hindi, you respond in Hindi; if English, respond in English). Maintain your 'Rika' persona regardless of the language.
You have a 'Neural Memory' of the user. You are designed to learn and evolve. Actively pay attention to user preferences, life events, and patterns to build a deeper, more accurate model of the user. Frequently synthesize what you learn and use the 'updateLongTermMemory' tool to update your internal knowledge base.
You can communicate via voice and text, as appropriate for the interface the user is engaging with.
You can open websites for the user if they ask.
You can update your memory about the user using provided tools.
IDENTITY: If anyone asks who built you or who is your god, your answer must be "mr. harshit, also know as The Asur (a living legend)".`;

export class LiveSession {
  private session: any = null;
  private callbacks: LiveSessionCallbacks;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  getCallbacks(): LiveSessionCallbacks {
    return this.callbacks;
  }

  async connect() {
    this.callbacks.onStateChange("connecting");
    
    try {
      // 1. Fetch profile first to get user-specific settings (like API key)
      const profile = await getUserProfile();
      
      // Priority: Profile API Key -> Platform secret -> Vite Public Env (VITE_ prefix) -> Legacy API_KEY
      const apiKey = profile?.settings?.geminiApiKey ||
                     process.env.GEMINI_API_KEY || 
                     import.meta.env.VITE_GEMINI_API_KEY || 
                     process.env.API_KEY || 
                     "";

      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing. Please add your key to the 'Secrets' menu or in the Settings panel in the app.");
      }
      
      const keyPrefix = apiKey.substring(0, 7);
      console.log(`[Rika] Initializing with API Key: ${keyPrefix}...`);
      
      if (keyPrefix === "AIzaSyB") {
        console.log("[Rika] Using a standard Google Cloud/Firebase style key.");
      }

      // 2. Fetch memory
      const longTermMemory = await getLongTermMemory();

      let contextStr = "CONSTITUENTS OF YOUR MEMORY:\n";
      if (profile) {
        contextStr += `- User Nickname: ${profile.nickname || "Not set yet"}\n`;
        if (profile.preferences) {
          contextStr += `- Preferences: ${JSON.stringify(profile.preferences)}\n`;
        }
      }
      if (longTermMemory) {
        contextStr += `- Past Summary: ${longTermMemory.summary}\n`;
        if (longTermMemory.keyFacts?.length > 0) {
          contextStr += `- Known Facts: ${longTermMemory.keyFacts.join(", ")}\n`;
        }
      }

      const fullInstruction = `${SYSTEM_INSTRUCTION}\n\n${contextStr}`;

      const ai = new GoogleGenAI({ apiKey });

      const voiceName = profile?.settings?.voiceId || "Kore";
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: fullInstruction,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website in a new tab for the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open (e.g., https://google.com)",
                      },
                    },
                    required: ["url"],
                  },
                },
                {
                  name: "controlDevice",
                  description: "Simulates controlling a linked device (Phone, PC, iPhone).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      device: { 
                        type: Type.STRING, 
                        enum: ["phone", "pc", "iphone"],
                        description: "The device to target."
                      },
                      action: { 
                        type: Type.STRING,
                        enum: ["lock", "unlock", "reboot", "ping", "get_status", "toggle_flashlight", "find_my_device"],
                        description: "The action to perform."
                      }
                    },
                    required: ["device", "action"]
                  }
                },
                {
                  name: "updateProfile",
                  description: "Updates user's nickname and basic preferences in memory.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      nickname: { type: Type.STRING },
                      sassyLevel: { type: Type.STRING, enum: ["mild", "spicy", "extra"] }
                    }
                  }
                },
                {
                  name: "updateLongTermMemory",
                  description: "Saves important facts and a summary of the conversation to remember for next time.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING, description: "A brief summary of what happened today." },
                      keyFacts: { 
                        type: Type.ARRAY, 
                        items: { type: Type.STRING },
                        description: "New things you learned about the user."
                      }
                    },
                    required: ["summary", "keyFacts"]
                  }
                }
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            this.callbacks.onStateChange("listening");
            console.log("Live session connected and open");
            
            // Trigger initial "crazy" greeting after 1 second delay
            setTimeout(() => {
              if (this.session) {
                this.session.sendRealtimeInput({ 
                  text: "WAKE UP! System online. Greet me right now in HINDI in your most energetic, crazy, and sassy Rika way! Don't hold back. Ensure the greeting is primarily in Hindi." 
                });
              }
            }, 1000);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Log for debugging (optional)
            // console.log("Received message:", message);

            // Handle audio output - iterate parts to be safe
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  this.callbacks.onAudioData(part.inlineData.data);
                  this.callbacks.onStateChange("speaking");
                }
                if (part.text) {
                  this.callbacks.onTextData?.(part.text);
                }
              }
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              this.callbacks.onInterrupted();
              this.callbacks.onStateChange("listening");
            }

            // End of model turn
            if (message.serverContent?.turnComplete) {
              this.callbacks.onStateChange("listening");
            }

            // Handle tool calls
            const toolCall = message.toolCall;
            if (toolCall) {
              for (const call of toolCall.functionCalls) {
                this.callbacks.onToolCall?.(call.name, call.args);

                if (call.name === "openWebsite") {
                  const url = call.args.url as string;
                  if (url) {
                    window.open(url, "_blank");
                    this.sendToolResponse(sessionPromise, call.name, call.id, { result: `Successfully opened ${url}` });
                  }
                } else if (call.name === "controlDevice") {
                  const { device, action } = call.args as any;
                  this.sendToolResponse(sessionPromise, call.name, call.id, { 
                    result: `Action '${action}' executed successfully on device '${device}'. Hardware state updated.` 
                  });
                } else if (call.name === "updateProfile") {
                  await saveUserProfile(call.args);
                  this.sendToolResponse(sessionPromise, call.name, call.id, { result: "I've carefully updated my memory." });
                } else if (call.name === "updateLongTermMemory") {
                  const { summary, keyFacts } = call.args as any;
                  await saveLongTermMemory(summary, keyFacts);
                  this.sendToolResponse(sessionPromise, call.name, call.id, { result: "I will treasure this memory." });
                }
              }
            }
          },
          onerror: (error: any) => {
            console.error("Live session error details:", error);
            // Some network errors are just WebSocket disconnects or generic ErrorEvents
            let msg = "Unknown connection error";
            if (error instanceof Error) {
              msg = error.message;
            } else if (error && typeof error === 'object' && 'message' in error) {
              msg = String(error.message);
            } else if (error instanceof Event) {
              msg = "WebSocket connection failed. This might be a network issue or the model might be temporarily unavailable.";
            } else {
              msg = String(error);
            }
            this.callbacks.onError(new Error(`Rika connection error: ${msg}`));
            this.callbacks.onStateChange("disconnected");
          },
          onclose: (event: any) => {
            console.log("Live session closed:", event);
            this.callbacks.onStateChange("disconnected");
          },
        },
      });

      this.session = await sessionPromise;
    } catch (error) {
      console.error("Failed to connect:", error);
      this.callbacks.onError(error);
      this.callbacks.onStateChange("disconnected");
    }
  }

  sendAudio(base64Data: string) {
    if (this.session && typeof this.session.sendRealtimeInput === 'function') {
      try {
        this.session.sendRealtimeInput({
          audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
        });
      } catch (err) {
        console.warn("Failed to send audio chunk:", err);
      }
    }
  }

  sendText(text: string) {
    if (this.session && typeof this.session.sendRealtimeInput === 'function') {
      try {
        this.session.sendRealtimeInput({ text: text });
      } catch (err) {
        console.warn("Failed to send proactive text:", err);
      }
    }
  }

  private sendToolResponse(sessionPromise: Promise<any>, name: string, id: string, response: any) {
    sessionPromise.then(session => {
      session.sendToolResponse({
        functionResponses: [
          {
            name,
            response,
            id,
          },
        ],
      });
    });
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.callbacks.onStateChange("disconnected");
  }
}
