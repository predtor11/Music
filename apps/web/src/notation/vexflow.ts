/**
 * VexFlow and its Bravura music font are large, so they load the first time a
 * staff is drawn rather than with the app.
 */

type VexFlowModule = typeof import('vexflow/bravura');

let loading: Promise<VexFlowModule> | null = null;

export function loadVexFlow(): Promise<VexFlowModule> {
  loading ??= import('vexflow/bravura').then(async (vf) => {
    // Glyphs are measured with the font, so wait for it before drawing.
    await document.fonts?.load('30px Bravura').catch(() => undefined);
    return vf;
  });
  return loading;
}
