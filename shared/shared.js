const { hsl: { hex: hsl_to_hex } } = require('color-convert');

const convert_hue = n => ({
  hex: parseInt(hsl_to_hex(n, 100, 30), 16),
  css: `color: hsl(${n}, 100%, 30%);`
});

module.exports = {
  normalize(s, trim) {
    if(trim === undefined) trim = true;
    let suffix = trim ? '' : s.match(/\s*$/)[0];
    s = s.normalize('NFD').replace(/ı/g, 'i').replace(/ȷ/g, 'j');
    let words = s.split(/\s+/gi).filter(_ => _);
    return words.map(w =>
      w.replace(
        /(['\u02bc\u2018\u2019x-]*)([^aeiouyq\u0300-\u036f'\u02bc\u2018\u20190-9x-]*)([aeiouy])([\u0300-\u036f]?)([aeiouy]*(?![\u0300-\u036f])q?)([0-8]*)/gi,
        (_, _apo, initial, first, tone, rest, num, offset) => {
          if(tone === '\u0304') tone = '';
          if(num) tone = ['', '', '\u0301', '\u0308', '\u0309', '\u0302', '\u0300', '\u0303', ''][num];
          let abnormal = offset && tone !== '';
          return [
            abnormal && ' ',
            offset && !initial && !abnormal && "'",
            initial, first, tone, rest
          ].filter(_ => _).join('');
        }))
      .join(' ')
      .normalize("NFC")
      .replace(/i/g, "ı") + suffix;
  },

  color_for(name) {
    if(name === 'official')
      return {hex: 0x333333, css: '#333'};
    let n = 0;
    for(let i = 0, l = name.length; i < l; ++i)
      n = (((n << 5) - n) + name.charCodeAt(i)) % 360;
    return convert_hue(n);
  },

  convert_hue,

  score_color: n => convert_hue(Math.atan(n / 2) / Math.PI * 2),

  score_number: n =>
      n > 0 ? `+${n}`
    : n < 0 ? `−${-n}`
    : '±',
}
