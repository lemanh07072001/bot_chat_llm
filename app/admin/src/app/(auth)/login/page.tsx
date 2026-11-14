import React from 'react';
import { isRegistrationOpen } from '@/lib/session';
import LoginForm from './login-form';

export default async function LoginPage() {
  // Decides whether to offer the first-admin link; the API closes
  // self-registration once any account exists.
  return <LoginForm registrationOpen={await isRegistrationOpen()} />;
}
