/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "./lib/firebase";
import { AuthUser, loginWithCredentials, onAuthSessionChanged } from "./lib/auth";
import RikaInterface from "./components/RikaInterface";
import Sidebar from "./components/Sidebar";
import Profile from "./components/Profile";
import Tone from "./components/Tone";
import Settings from "./components/Settings";
import { LogIn, Loader2, MessageSquare, User as UserIcon, Lock, Eye, EyeOff, AlertCircle, Sparkles } from "lucide-react";
import { UserMemory, subscribeToProfile } from "./lib/memory";
import ChatInterface from "./components/ChatInterface";

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("home");

  // Login form state
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (error) {
        if (error instanceof Error && error.message.includes("the client is offline")) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    let profileUnsubscribe: () => void = () => {};

    const authUnsubscribe = onAuthSessionChanged((u) => {
      setUser(u);
      profileUnsubscribe();
      if (u) {
        profileUnsubscribe = subscribeToProfile((p) => {
          setProfile(p);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      profileUnsubscribe();
    };
  }, []);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const result = loginWithCredentials(loginId, password);
    if (!result.valid) {
      setLoginError(result.error || "Invalid credentials.");
    } else {
      setLoginId("");
      setPassword("");
    }
  };

  const isLight = profile?.settings?.theme === "light";
  const themeClass = isLight ? "bg-white text-slate-900" : "bg-[#050508] text-white";

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#050508] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="w-72 h-72 rounded-full bg-gradient-to-tr from-blue-600/20 to-cyan-500/20 blur-3xl pointer-events-none absolute" />

        <section className="w-full max-w-md bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-3xl p-8 sm:p-10 relative z-10 shadow-2xl">
          <header className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-4 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
              <Sparkles className="w-7 h-7" />
            </div>
            <h1 className="text-4xl font-light tracking-tighter text-white mb-2 italic">
              Rika Assistant
            </h1>
            <p className="text-slate-400 text-sm font-light leading-relaxed">
              Enter your operator credentials to initialize neural link.
            </p>
          </header>

          <form onSubmit={handleLoginSubmit} className="space-y-5" noValidate>
            {loginError && (
              <div
                role="alert"
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="space-y-2 text-left">
              <label
                htmlFor="login-id-input"
                className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 ml-1"
              >
                Login ID
              </label>
              <div className="relative flex items-center">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-4 pointer-events-none" />
                <input
                  id="login-id-input"
                  type="text"
                  autoComplete="username"
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="Enter Login ID"
                  className="w-full bg-black/50 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2 text-left">
              <label
                htmlFor="password-input"
                className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 ml-1"
              >
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-4 pointer-events-none" />
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="Enter Password"
                  className="w-full bg-black/50 border border-white/10 rounded-2xl pl-11 pr-12 py-3.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded-lg"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-2xl transition-all active:scale-[0.99] flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(37,99,235,0.3)] cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className={`min-h-screen flex ${themeClass}`}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} profile={profile} />
      <main className="flex-1 overflow-y-auto h-screen custom-scrollbar relative">
        {activeTab === "home" && <RikaInterface profile={profile} />}
        {activeTab === "chat" && (
          <>
            <ChatInterface profile={profile} />
            <div className="w-full max-w-2xl mx-auto mt-8 bg-white/[0.02] border border-white/5 rounded-2xl p-6 text-slate-400">
              <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4" /> Neural Memory History
              </h3>
              <p className="text-sm italic">Summaries of past conversations will appear here...</p>
            </div>
          </>
        )}
        {activeTab === "profile" && <Profile />}
        {activeTab === "tone" && <Tone />}
        {activeTab === "settings" && <Settings profile={profile} setProfile={setProfile} />}
      </main>
    </div>
  );
}
