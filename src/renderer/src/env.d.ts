/// <reference types="vite/client" />

import type { ColabDeskApi } from "@shared/api";

declare global {
  interface Window {
    colabdesk: ColabDeskApi;
  }
}

export {};
