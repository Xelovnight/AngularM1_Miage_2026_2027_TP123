import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Intercepteur HTTP qui injecte le token JWT et gère les erreurs 401 (expiration de session). */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();

  const authReq = token
    ? request.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      })
    : request;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      // Si le serveur renvoie 401 (non autorisé / token expiré) sur une route protégée
      if (error instanceof HttpErrorResponse && error.status === 401) {
        if (!request.url.includes('/api/auth/login')) {
          console.warn('[authInterceptor] 401 Unauthorized : token invalide ou expiré, déconnexion.');
          auth.logout();
          void router.navigateByUrl('/login');
        }
      }
      return throwError(() => error);
    }),
  );
};
