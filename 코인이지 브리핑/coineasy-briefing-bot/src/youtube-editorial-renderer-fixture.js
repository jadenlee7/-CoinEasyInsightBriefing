// Synthetic renderer validation only. Never sign, enqueue or upload this fixture.
function rendererSmokeFixture() {
  const voiceoverSegmentsKo = [
    '숫자 하나로 판단해도 될까요?',
    '이 영상은 디자인을 확인하는 비공개 샘플입니다.',
    '확인된 사실과 해석은 나누어 읽어야 합니다.',
    '화면의 시장 지표는 테스트용 가상 수치입니다.',
    '오늘은 원문의 날짜와 적용 대상을 확인하세요.',
    '',
  ];
  return {
    publishable: false,
    privatePreview: true,
    editorialDate: '2026-09-01',
    editorial: {
      headline: '숫자 하나로 판단해도 될까요?',
      fact: '비공개 디자인 검증용 샘플입니다. 실제 시장 사실을 설명하는 영상이 아닙니다.',
      verdict: '확인된 사실과 해석은 구분해서 읽어야 합니다.',
      marketContext: '테스트용 가상 지표입니다.',
      action: '원문의 날짜와 적용 대상을 확인하세요.',
      sourceCta: '속보보다 확인. 매일 한 가지씩.',
      sourceLabel: '비공개 렌더 검증용',
      sourceUrls: ['https://example.invalid/private-renderer-fixture'],
      voiceoverKo: voiceoverSegmentsKo.filter(Boolean).join(' '),
      voiceoverSegmentsKo,
    },
    youtube: {
      duration_seconds: 32,
      metrics: [
        { label: 'BTC', value: '$60,000', as_of: '2026-09-01T09:00:00Z' },
        { label: '김치프리미엄', value: '0.50%', as_of: '2026-09-01T09:00:00Z' },
        { label: '공포탐욕', value: '50', as_of: '2026-09-01T00:00:00Z' },
      ],
    },
  };
}

export { rendererSmokeFixture };
