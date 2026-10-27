import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth-response.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerMock: { navigateByUrl: ReturnType<typeof vi.fn> };
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

    routerMock = {
      navigateByUrl: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerMock },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  it('login() utilise POST /api/auth/login avec le bon corps et stocke le token', () => {
    const mockResponse: AuthResponse = {
      token: 'jwt-mock-token-xyz',
      user: {
        id: 'u-1',
        name: 'Alice',
        email: 'alice@example.com',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    };

    service.login('alice@example.com', 'Secret123!').subscribe((res) => {
      expect(res).toEqual(mockResponse);
      expect(service.token()).toBe('jwt-mock-token-xyz');
      expect(service.currentUser()?.name).toBe('Alice');
      expect(fakeStorage.getItem('gpc_token')).toBe('jwt-mock-token-xyz');
    });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'alice@example.com',
      password: 'Secret123!',
    });

    req.flush(mockResponse);
  });

  it('logout() supprime le token de localStorage, réinitialise l’état et redirige vers /login', () => {
    fakeStorage.setItem('gpc_token', 'token-to-remove');
    service.token.set('token-to-remove');
    service.currentUser.set({
      id: 'u-1',
      name: 'Alice',
      email: 'alice@example.com',
      createdAt: '2026-10-01T00:00:00.000Z',
    });

    service.logout();

    expect(fakeStorage.getItem('gpc_token')).toBeNull();
    expect(service.token()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
