import { Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { FriendService } from '../../shared/services/friend.service';
import { SnackbarComponent } from '../../shared/components/snackbar/snackbar.component';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, SnackbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly friends = inject(FriendService);

  constructor() {
    // Dès qu'un utilisateur est connecté, on charge ses amitiés pour afficher
    // le nombre d'invitations reçues dans la navigation ; on l'oublie à la déconnexion.
    effect(() => {
      if (!this.auth.token()) {
        this.friends.clear();
        return;
      }
      this.friends.refresh().subscribe({
        error: (err) => console.error('[App] Chargement des invitations impossible', err),
      });
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
