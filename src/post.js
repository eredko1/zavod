// Post-processing pipeline. Owned by: POST agent. STUB — replace entirely.
export async function init(ctx) {
  return { render: (dt, ctx) => ctx.renderer.render(ctx.scene, ctx.camera), shake: (amt) => {} };
}
export function onResize(ctx) {}
