import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { getCurrentUser } from './auth';

export interface UserMemory {
  nickname?: string;
  aiName?: string;
  bio?: string;
  instagramId?: string;
  preferences?: {
    sassyLevel: 'mild' | 'spicy' | 'extra';
    tone?: 'sassy' | 'caring' | 'helpful' | 'playful';
    favoriteTopic?: string;
  };
  settings?: {
    audioVolume: number;
    voiceId: string;
    avatarId: string;
    customAvatarUrl?: string;
    theme: string;
    geminiApiKey?: string;
  };
  longTermMemory?: {
    summary: string;
    keyFacts: string[];
  };
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  preview: string;
  summary?: string;
  timestamp: any;
}

const DEFAULT_PROFILE: UserMemory = {
  nickname: 'Admin',
  aiName: 'Rika',
  bio: '',
  preferences: {
    sassyLevel: 'spicy',
    tone: 'sassy',
  },
  settings: {
    audioVolume: 80,
    voiceId: 'Kore',
    avatarId: 'Rika',
    theme: 'dark',
  },
};

type ProfileListener = (profile: UserMemory) => void;
const profileListeners = new Set<ProfileListener>();

function notifyProfileListeners(profile: UserMemory) {
  profileListeners.forEach((listener) => listener(profile));
}

function getActiveUserId(): string | null {
  const sessionUser = getCurrentUser();
  if (sessionUser) return sessionUser.uid;
  if (auth.currentUser) return auth.currentUser.uid;
  return null;
}

function getLocalStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setLocalStorageJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

export function subscribeToProfile(listener: ProfileListener): () => void {
  profileListeners.add(listener);
  getUserProfile().then((p) => {
    if (p) listener(p);
  });
  return () => {
    profileListeners.delete(listener);
  };
}

export async function getChatHistory(): Promise<ChatHistoryItem[]> {
  const uid = getActiveUserId();
  if (!uid) return [];

  const localKey = `rika_history_${uid}`;
  const localItems = getLocalStorageJson<ChatHistoryItem[]>(localKey, []);

  if (auth.currentUser) {
    try {
      const historyRef = collection(db, 'users', auth.currentUser.uid, 'history');
      const q = query(historyRef, orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as ChatHistoryItem[];
    } catch {
      return localItems;
    }
  }

  return localItems;
}

export async function deleteHistoryItem(id: string) {
  const uid = getActiveUserId();
  if (!uid) return;

  const localKey = `rika_history_${uid}`;
  const current = getLocalStorageJson<ChatHistoryItem[]>(localKey, []);
  setLocalStorageJson(
    localKey,
    current.filter((item) => item.id !== id)
  );

  if (auth.currentUser) {
    try {
      const docRef = doc(db, 'users', auth.currentUser.uid, 'history', id);
      await deleteDoc(docRef);
    } catch {
      // Fallback already handled in localStorage
    }
  }
}

export async function updateHistoryItem(id: string, data: Partial<ChatHistoryItem>) {
  const uid = getActiveUserId();
  if (!uid) return;

  const localKey = `rika_history_${uid}`;
  const current = getLocalStorageJson<ChatHistoryItem[]>(localKey, []);
  setLocalStorageJson(
    localKey,
    current.map((item) => (item.id === id ? { ...item, ...data } : item))
  );

  if (auth.currentUser) {
    try {
      const docRef = doc(db, 'users', auth.currentUser.uid, 'history', id);
      await updateDoc(docRef, data);
    } catch {
      // Fallback already handled in localStorage
    }
  }
}

export async function saveHistoryItem(title: string, preview: string) {
  const uid = getActiveUserId();
  if (!uid) return;

  const localKey = `rika_history_${uid}`;
  const current = getLocalStorageJson<ChatHistoryItem[]>(localKey, []);
  const newItem: ChatHistoryItem = {
    id: `hist_${Date.now()}`,
    title,
    preview,
    timestamp: new Date().toISOString(),
  };
  setLocalStorageJson(localKey, [newItem, ...current]);

  if (auth.currentUser) {
    try {
      const historyRef = collection(db, 'users', auth.currentUser.uid, 'history');
      await setDoc(doc(historyRef), {
        userId: auth.currentUser.uid,
        title,
        preview,
        timestamp: serverTimestamp()
      });
    } catch {
      // Fallback already handled in localStorage
    }
  }
}

export async function getUserProfile(): Promise<UserMemory | null> {
  const uid = getActiveUserId();
  if (!uid) return null;

  const localKey = `rika_profile_${uid}`;
  const localProfile = getLocalStorageJson<UserMemory | null>(localKey, null);

  if (auth.currentUser) {
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const remoteData = snap.data() as UserMemory;
        setLocalStorageJson(localKey, remoteData);
        return remoteData;
      }
    } catch {
      // Fallback to localStorage
    }
  }

  if (localProfile) {
    return localProfile;
  }

  setLocalStorageJson(localKey, DEFAULT_PROFILE);
  return DEFAULT_PROFILE;
}

export async function saveUserProfile(data: Partial<UserMemory>) {
  const uid = getActiveUserId();
  if (!uid) return;

  const localKey = `rika_profile_${uid}`;
  const existing = getLocalStorageJson<UserMemory>(localKey, DEFAULT_PROFILE);
  const merged: UserMemory = {
    ...existing,
    ...data,
    preferences: {
      ...(existing.preferences || { sassyLevel: 'spicy' }),
      ...(data.preferences || {}),
    },
    settings: {
      ...(existing.settings || DEFAULT_PROFILE.settings!),
      ...(data.settings || {}),
    },
  };

  setLocalStorageJson(localKey, merged);
  notifyProfileListeners(merged);

  if (auth.currentUser) {
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        await updateDoc(userRef, {
          ...merged,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(userRef, {
          userId: auth.currentUser.uid,
          ...merged,
          updatedAt: serverTimestamp()
        });
      }
    } catch {
      // Local storage is already updated
    }
  }
}

export async function getLongTermMemory() {
  const uid = getActiveUserId();
  if (!uid) return null;

  const localKey = `rika_ltm_${uid}`;
  const localMemory = getLocalStorageJson<{ summary: string; keyFacts: string[] } | null>(localKey, null);

  if (auth.currentUser) {
    try {
      const memoryRef = doc(db, 'users', auth.currentUser.uid, 'memory', 'longterm');
      const snap = await getDoc(memoryRef);
      if (snap.exists()) {
        return snap.data();
      }
    } catch {
      // Fallback to localStorage
    }
  }

  return localMemory;
}

export async function saveLongTermMemory(summary: string, keyFacts: string[]) {
  const uid = getActiveUserId();
  if (!uid) return;

  const localKey = `rika_ltm_${uid}`;
  setLocalStorageJson(localKey, {
    userId: uid,
    summary,
    keyFacts,
    lastTurnAt: new Date().toISOString(),
  });

  if (auth.currentUser) {
    try {
      const memoryRef = doc(db, 'users', auth.currentUser.uid, 'memory', 'longterm');
      await setDoc(memoryRef, {
        userId: auth.currentUser.uid,
        summary,
        keyFacts,
        lastTurnAt: serverTimestamp()
      });
    } catch {
      // Fallback already saved locally
    }
  }
}
