import { Injectable, signal } from '@angular/core';

export type SnackbarType = 'success' | 'error' | 'info';

export interface SnackbarMessage {
  id: number;
  text: string;
  type: SnackbarType;
}

/**
 * Service de gestion des notifications SnackBar/Toast.
 * Permet d'émettre des messages temporaires de succès ou d'erreur
 * depuis n'importe quel composant ou service.
 */
@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private nextId = 0;
  readonly messages = signal<SnackbarMessage[]>([]);

  show(text: string, type: SnackbarType = 'info', durationMs = 4000): void {
    const id = ++this.nextId;
    const item: SnackbarMessage = { id, text, type };
    this.messages.update((list) => [...list, item]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
  }

  showSuccess(text: string, durationMs = 4000): void {
    this.show(text, 'success', durationMs);
  }

  showError(text: string, durationMs = 5000): void {
    this.show(text, 'error', durationMs);
  }

  dismiss(id: number): void {
    this.messages.update((list) => list.filter((m) => m.id !== id));
  }
}
