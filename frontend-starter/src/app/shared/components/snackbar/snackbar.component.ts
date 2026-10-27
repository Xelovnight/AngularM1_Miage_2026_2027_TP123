import { Component, inject } from '@angular/core';
import { SnackbarService } from '../../services/snackbar.service';

@Component({
  selector: 'app-snackbar',
  imports: [],
  templateUrl: './snackbar.component.html',
  styleUrl: './snackbar.component.css',
})
export class SnackbarComponent {
  readonly snackbarService = inject(SnackbarService);

  dismiss(id: number): void {
    this.snackbarService.dismiss(id);
  }
}
