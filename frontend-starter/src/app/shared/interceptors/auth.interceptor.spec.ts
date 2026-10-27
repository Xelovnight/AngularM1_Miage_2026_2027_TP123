import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;
  let store: Record<string, string> = {};

  const fakeStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', fakeStorage);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  it('ajoute l’en-tête Authorization: Bearer <token> lorsqu’un token existe', () => {
    authService.token.set('mock-secret-jwt-123');

    http.get('/api/tracks').subscribe();

    const req = httpMock.expectOne('/api/tracks');
    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer mock-secret-jwt-123',
    );
    req.flush([]);
  });

  it('n’ajoute pas d’en-tête Authorization lorsqu’aucun token n’existe', () => {
    authService.token.set(null);

    http.get('/api/tracks').subscribe();

    const req = httpMock.expectOne('/api/tracks');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });
});
