/** eddistの認証画面を外部通信なしで再現するテスト用データ。実サービスではない。 */
export const EDGE_AUTH_CODE = "123456";
export const EDGE_AUTH_TOKEN = "#abcdefghijklmnop";

/** StorybookとE2Eで同じ画面を使い、同意条件の食い違いを避ける。 */
export function createEdgeAuthPage(): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>コード認証画面（模擬）</title>
<style>body{font-family:sans-serif;max-width:45rem;margin:auto;padding:1rem;line-height:1.6} #terms{height:10rem;overflow:auto;border:1px solid;padding:1rem} [hidden]{display:none} button,input{font-size:1rem;margin:.5rem;padding:.5rem}</style></head><body>
<h1>コード認証（テスト用）</h1><section id="auth"><h2>利用規約への同意</h2><button id="show" type="button">利用規約を確認して同意する</button><p id="agreed" hidden>利用規約に同意しました</p>
<section id="modal" hidden aria-label="利用規約"><h2>利用規約</h2><div id="terms" tabindex="0">${"<p>テスト用の利用規約です。実際の規約ではありません。</p>".repeat(20)}</div>
<label><input id="oath" type="checkbox">禁止事項を確認し、違反しないことに同意します</label><button id="agree" type="button" disabled>利用規約に同意する</button><button id="cancel" type="button">キャンセル</button></section>
<h2>認証手順</h2><form id="login"><label>認証コード<input name="auth-code" id="code" required pattern="[0-9]{6}" inputmode="numeric"></label><button id="submit" disabled>利用規約に同意して認証を行う</button></form></section>
<section id="success" hidden><h2>認証に成功しました</h2><label>認証トークン<input id="token" readonly value="${EDGE_AUTH_TOKEN}"></label><p>トークンをメール欄に貼り付けて再投稿してください。</p></section><p id="error" role="alert" hidden>認証コードが正しくありません</p>
<script>
const $ = id => document.getElementById(id); let scrolled = false; let agreed = false;
$('show').onclick = () => { $('modal').hidden = false; };
$('cancel').onclick = () => { $('modal').hidden = true; };
function update() { $('agree').disabled = !(scrolled && $('oath').checked); }
$('terms').onscroll = () => { if ($('terms').scrollTop + $('terms').clientHeight >= $('terms').scrollHeight - 10) scrolled = true; update(); };
$('oath').onchange = update;
$('agree').onclick = () => { if (!scrolled || !$('oath').checked) return; agreed = true; $('modal').hidden = true; $('agreed').hidden = false; $('submit').disabled = false; };
$('login').onsubmit = e => { e.preventDefault(); if (!agreed || !$('oath').checked) return; if ($('code').value !== '${EDGE_AUTH_CODE}') { $('error').hidden = false; return; } $('auth').hidden = true; $('error').hidden = true; $('success').hidden = false; };
</script></body></html>`;
}
