import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from './api';

export type Me = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  canTeach: boolean;
};

export async function registerPasskeyForInvitation(token: string): Promise<{ user: Me }> {
  const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>(
    `/invitations/${token}/register/options`,
  );
  const attestation = await startRegistration({ optionsJSON });
  return api.post(`/invitations/${token}/register/verify`, attestation);
}

export async function loginWithPasskey(): Promise<{ user: Me }> {
  const optionsJSON = await api.post<PublicKeyCredentialRequestOptionsJSON>('/auth/login/options');
  const assertion = await startAuthentication({ optionsJSON });
  return api.post('/auth/login/verify', assertion);
}

export async function addPasskey(): Promise<void> {
  const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>('/me/passkeys/options');
  const attestation = await startRegistration({ optionsJSON });
  await api.post('/me/passkeys/verify', attestation);
}
