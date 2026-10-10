import { UserSettingsSchema } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { fromServer, onSignIn, serverPatch } from '../src/settings/sync.js';

const defaults = UserSettingsSchema.parse({});

describe('settings sync', () => {
  it('syncs the foundation instrument field, including an unchosen account', () => {
    expect(serverPatch({ instrument: null })).toEqual({ instrument: null });
    const guitar = { ...defaults, instrument: 'guitar' as const };
    expect(onSignIn(defaults, guitar, false).settings.instrument).toBe('guitar');
    expect(onSignIn(guitar, defaults, true).push).toMatchObject({ instrument: 'guitar' });
  });

  it('never sends the MIDI input id, which belongs to this computer', () => {
    expect(serverPatch({ midiInputId: 'casio' })).toBeNull();
    expect(serverPatch({ noteNaming: 'sargam', midiInputId: 'casio' })).toEqual({ noteNaming: 'sargam' });
  });

  it("takes the account's settings but keeps this computer's MIDI input", () => {
    const local = { ...defaults, midiInputId: 'casio', noteNaming: 'western' as const };
    const server = { ...defaults, midiInputId: 'other-pc', noteNaming: 'sargam' as const, theme: 'light' as const };
    expect(fromServer(local, server)).toEqual({ ...server, midiInputId: 'casio' });
  });

  it('lets the account win on sign-in when nothing changed here', () => {
    const plan = onSignIn({ ...defaults, noteNaming: 'both' }, { ...defaults, noteNaming: 'sargam' }, false);
    expect(plan).toEqual({ settings: { ...defaults, noteNaming: 'sargam' }, push: null });
  });

  it('sends changes made while signed out up to the account', () => {
    const local = { ...defaults, noteNaming: 'both' as const, midiInputId: 'casio' };
    const plan = onSignIn(local, defaults, true);
    expect(plan.settings).toEqual(local);
    expect(plan.push).toMatchObject({ noteNaming: 'both' });
    expect(plan.push).not.toHaveProperty('midiInputId');
  });

  it('sends nothing when the signed-out changes match the account already', () => {
    expect(onSignIn(defaults, defaults, true).push).toBeNull();
  });
});
