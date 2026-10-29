import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { ExplorePageComponent } from './components/explore-page/explore-page';
import { FriendsPageComponent } from './components/friends-page/friends-page';
import { SharedPageComponent } from './components/shared-page/shared-page';
import { ActivityPageComponent } from './components/activity-page/activity-page';
import { LoginPageComponent } from './components/login-page/login-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { TracksPageComponent } from './components/tracks-page/tracks-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tracks' },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'tracks', component: TracksPageComponent, canActivate: [authGuard] },
  { path: 'explore', component: ExplorePageComponent, canActivate: [authGuard] },
  { path: 'friends', component: FriendsPageComponent, canActivate: [authGuard] },
  { path: 'shared', component: SharedPageComponent, canActivate: [authGuard] },
  { path: 'activity', component: ActivityPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'tracks' },
];
