/**
 * Angemeldete Person und Bearer-Token.
 *
 * Der Server prueft das Token bei jeder Anfrage und liefert die Rechte aus
 * `v_user_permissions` mit. Im Browser werden Token und oeffentliches Profil
 * gespeichert, damit ein Reload die Sitzung nicht verliert.
 *
 * `useAuth` ist ein externer Store: Login, Logout und ein 401 aus `api.ts`
 * schreiben ueber `lib/storage.ts`, und alle Ansichten reagieren sofort.
 */

import { useSyncExternalStore } from "react";

import type { User } from "../types";
import { read, remove, subscribe, write } from "./storage";

const TOKEN_KEY = "authToken";
const USER_KEY = "authUser";

export interface AuthState {
  user: User | null;
  token: string | null;
}

let cachedRaw = "";
let cached: AuthState = { user: null, token: null };

function snapshot(): AuthState {
  const token = read<string | null>(TOKEN_KEY, null);
  const user = read<User | null>(USER_KEY, null);
  const raw = `${token ?? ""}|${user ? JSON.stringify(user) : ""}`;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = { user, token };
  }
  return cached;
}

/** Liest das Token fuer den HTTP-Client, ohne React einzubinden. */
export function getToken(): string | null {
  return read<string | null>(TOKEN_KEY, null);
}

export function signIn(user: User, token: string): void {
  write(TOKEN_KEY, token);
  write(USER_KEY, user);
}

export function signOut(): void {
  remove(TOKEN_KEY);
  remove(USER_KEY);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
