/**
 * 注册 / 找回密码时可选的密保问题（id 持久化存库，文案可改预设表）
 */
const PRESETS = [
  { id: 'sq_mother_name', text: '您母亲的姓名是？' },
  { id: 'sq_father_name', text: '您父亲的姓名是？' },
  { id: 'sq_birth_city', text: '您出生的城市是？' },
  { id: 'sq_first_school', text: '您小学校名是？' },
  { id: 'sq_first_teacher', text: '您小学一年级班主任姓氏是？' },
  { id: 'sq_first_job', text: '您第一份工作所在单位简称是？' },
  { id: 'sq_best_friend', text: '您少年时期好友昵称是？' },
  { id: 'sq_first_pet', text: '您养过的第一只宠物名字是？' },
  { id: 'sq_spouse_birth', text: '您配偶出生月份是？（填数字 1–12）' },
  { id: 'sq_license_last4', text: '您身份证后四位是？' },
];

const idSet = new Set(PRESETS.map((p) => p.id));

function listPresets() {
  return PRESETS.map(({ id, text }) => ({ id, text }));
}

function getText(id) {
  const hit = PRESETS.find((p) => p.id === id);
  return hit ? hit.text : '密保问题';
}

/** 须恰好两道不同且均在预设内 */
function validateTwoQuestionIds(ids) {
  if (!Array.isArray(ids) || ids.length !== 2) return false;
  const [a, b] = ids;
  if (a === b) return false;
  return idSet.has(a) && idSet.has(b);
}

module.exports = {
  listPresets,
  getText,
  validateTwoQuestionIds,
};
