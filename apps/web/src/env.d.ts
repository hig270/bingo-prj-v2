// 全体に効かせるスタイル（global.scss）は、読み込むだけで値を取り出さない。
// `*.scss` 全体を宣言すると、CSS Modules の型ファイルが無いときも通ってしまうので、ファイル名を限定する
declare module "*/global.scss" {}
