/**
 * 抽選演出で使う音のファイルと、その取得元。
 *
 * 音は「効果音ラボ」（https://soundeffect-lab.info/）の素材を使う。
 * 商用利用は無料・クレジット表記は任意・アプリへの組み込みは可。ただし素材の再配布は禁止なので、
 * 公開リポジトリには入れない（apps/web/public/sounds/ は .gitignore で除外している）。
 *
 * ファイルが無いとき（新しく取り込んだリポジトリや CI）は、その音が鳴らないだけで動く。
 * 用意するには、下の page を開いて title の音をダウンロードし、file の名前で
 * apps/web/public/sounds/ に置く（ダウンロードすると日本語の名前になるので、名前を変える）。
 */
export const SOUND_SOURCES = {
  rattle: {
    file: "lottery-machine1.mp3",
    title: "抽選機を回すガラガラ",
    page: "https://soundeffect-lab.info/sound/various/various3.html",
  },
  ball: {
    file: "lottery-machine-ball1.mp3",
    title: "抽選機から玉が出る（回した後に）",
    page: "https://soundeffect-lab.info/sound/various/various3.html",
  },
  jajean: {
    file: "jajean1.mp3",
    title: "ジャジャーン（紹介・登場）",
    page: "https://soundeffect-lab.info/sound/anime/",
  },
  jean: {
    file: "jean1.mp3",
    title: "ジャン！（紹介など）",
    page: "https://soundeffect-lab.info/sound/anime/",
  },
  rollFinish: {
    file: "roll-finish1.mp3",
    title: "ロールの閉めシンバル（登場音にも）",
    page: "https://soundeffect-lab.info/sound/anime/",
  },
  trumpet: {
    file: "trumpet1.mp3",
    title: "ラッパのファンファーレ（喜びの演出）",
    page: "https://soundeffect-lab.info/sound/anime/",
  },
  drumRoll: {
    file: "drum-roll1.mp3",
    title: "ドラムロール（生演奏）",
    page: "https://soundeffect-lab.info/sound/anime/",
  },
  cheer: {
    file: "people-performance-cheer1.mp3",
    title: "歓声と拍手（大盛り上がり）",
    page: "https://soundeffect-lab.info/sound/voice/people.html",
  },
} as const;

export type SoundName = keyof typeof SOUND_SOURCES;
