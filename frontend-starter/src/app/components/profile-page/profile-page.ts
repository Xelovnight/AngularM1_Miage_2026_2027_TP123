import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly message = signal('');
  readonly error = signal('');

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    // Si l'utilisateur est déjà en mémoire, pré-remplir le formulaire
    const current = this.auth.currentUser();
    if (current) {
      this.form.setValue({ name: current.name });
    }
    // Charger / synchroniser le profil depuis l'API GET /api/users/me
    this.load();
  }

  load(): void {
    this.message.set('');
    this.error.set('');
    this.auth.profile().subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil chargé', user.id);
        this.form.setValue({ name: user.name });
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Chargement impossible', error);
        this.error.set(error.error?.message ?? 'Impossible de charger le profil');
      },
    });
  }

  save(): void {
    if (this.form.invalid) return;

    this.message.set('');
    this.error.set('');
    const newName = this.form.getRawValue().name.trim();

    this.auth.update(newName).subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil enregistré', user.id);
        this.message.set('Nom mis à jour avec succès !');
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Enregistrement impossible', error);
        this.error.set(error.error?.message ?? 'Erreur lors de la mise à jour du profil');
      },
    });
  }
}
