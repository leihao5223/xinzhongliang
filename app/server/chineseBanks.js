/**
 * 中国大陆常见银行（储蓄卡）目录 — 用于绑定提现卡展示
 * logo 由前端按 brandColor + shortName 绘制矢量角标；亦可通过 code 映射静态资源
 */
const CHINESE_BANKS = [
  { code: 'ICBC', name: '中国工商银行', shortName: '工商', brandColor: '#C8102E' },
  { code: 'ABC', name: '中国农业银行', shortName: '农业', brandColor: '#009A44' },
  { code: 'BOC', name: '中国银行', shortName: '中国银行', brandColor: '#B81D24' },
  { code: 'CCB', name: '中国建设银行', shortName: '建设', brandColor: '#0051A3' },
  { code: 'PSBC', name: '中国邮政储蓄银行', shortName: '邮储', brandColor: '#007F3E' },
  { code: 'COMM', name: '交通银行', shortName: '交通', brandColor: '#003B7A' },
  { code: 'CMB', name: '招商银行', shortName: '招商', brandColor: '#C8102E' },
  { code: 'SPDB', name: '上海浦东发展银行', shortName: '浦发', brandColor: '#0D1C3D' },
  { code: 'CIB', name: '兴业银行', shortName: '兴业', brandColor: '#004185' },
  { code: 'CMBC', name: '中国民生银行', shortName: '民生', brandColor: '#005BAC' },
  { code: 'CITIC', name: '中信银行', shortName: '中信', brandColor: '#E60012' },
  { code: 'HXB', name: '华夏银行', shortName: '华夏', brandColor: '#E60012' },
  { code: 'CEB', name: '中国光大银行', shortName: '光大', brandColor: '#691A7A' },
  { code: 'GDB', name: '广发银行', shortName: '广发', brandColor: '#E60012' },
  { code: 'PAB', name: '平安银行', shortName: '平安', brandColor: '#FF6600' },
  { code: 'BOB', name: '北京银行', shortName: '北京', brandColor: '#E60012' },
  { code: 'BOS', name: '上海银行', shortName: '上海', brandColor: '#00479D' },
  { code: 'NJCB', name: '南京银行', shortName: '南京', brandColor: '#C8102E' },
  { code: 'HZB', name: '杭州银行', shortName: '杭州', brandColor: '#0068B7' },
  { code: 'NBCB', name: '宁波银行', shortName: '宁波', brandColor: '#E60012' },
  { code: 'CZB', name: '浙商银行', shortName: '浙商', brandColor: '#004986' },
  { code: 'HFB', name: '恒丰银行', shortName: '恒丰', brandColor: '#0052A4' },
  { code: 'CQB', name: '重庆银行', shortName: '重庆', brandColor: '#E60012' },
  { code: 'CDB', name: '成都银行', shortName: '成都', brandColor: '#E60012' },
  { code: 'HSB', name: '徽商银行', shortName: '徽商', brandColor: '#E60012' },
  { code: 'BHB', name: '渤海银行', shortName: '渤海', brandColor: '#005BAC' },
  { code: 'SRCB', name: '上海农商银行', shortName: '沪农商', brandColor: '#00479D' },
  { code: 'BJRCB', name: '北京农商银行', shortName: '京农商', brandColor: '#009A44' },
  { code: 'GRCB', name: '广州农商银行', shortName: '穗农商', brandColor: '#E60012' },
  { code: 'SDRCU', name: '山东省农村信用社', shortName: '山东农信', brandColor: '#009A44' },
  { code: 'HNRCC', name: '湖南省农村信用社', shortName: '湖南农信', brandColor: '#009A44' },
  { code: 'WXB', name: '网商银行', shortName: '网商', brandColor: '#1677FF' },
  { code: 'MYB', name: '微众银行', shortName: '微众', brandColor: '#0052CC' },
  { code: 'XWB', name: '新网银行', shortName: '新网', brandColor: '#00A870' },
  { code: 'ZYB', name: '众邦银行', shortName: '众邦', brandColor: '#E60012' },
];

function getBankByCode(code) {
  return CHINESE_BANKS.find((b) => b.code === String(code || '').toUpperCase()) || null;
}

module.exports = { CHINESE_BANKS, getBankByCode };
