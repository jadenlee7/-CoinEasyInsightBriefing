import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-dummy-key';

const { fearNote } = await import('./figma-daily/figmaDataBuilder.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const depositPath = path.join(root, 'content/insights/remittance/deposit-prep-checklist.md');
const sendPath = path.join(root, 'content/insights/remittance/send-before-checklist.md');

test('카드 노트는 답형이고 물음표로 시작하거나 끝내지 않는다', () => {
  const lines = [fearNote(10, 1), fearNote(10, 0), fearNote(80, -1), fearNote(80, 0), fearNote(40, 0), fearNote(60, 0)];
  for (const line of lines) {
    assert.ok(!/[?？]/.test(line), line);
  }
  assert.match(fearNote(10, 1), /가격은 올랐다/);
  assert.match(fearNote(80, -1), /조정이 겹쳤다/);
});

test('송금 도움자료 초안은 시드 비공유, 트래블룰, 주소 사전등록을 담고 수수료 메모는 보내기 전에 흡수한다', async () => {
  const deposit = await readFile(depositPath, 'utf8');
  const send = await readFile(sendPath, 'utf8');
  assert.match(deposit, /시드/);
  assert.match(deposit, /개인키/);
  assert.match(deposit, /공유하지 않는다/);
  assert.match(send, /트래블룰/);
  assert.match(send, /사전등록/);
  assert.match(send, /수수료/);
  assert.equal(send.split('USDC.e').length - 1, 1);
  assert.doesNotMatch(`${deposit}\n${send}`, /https?:\/\//);
  await assert.rejects(readFile(path.join(root, 'content/insights/remittance/fee-memo.md'), 'utf8'));
});
