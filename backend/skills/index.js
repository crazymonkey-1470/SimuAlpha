/**
 * Skill Registry — Sprint 8
 *
 * Every investing capability as a callable skill.
 * Each skill has: execute(input) → structured output
 */

const skills = {
  // === TECHNICAL ANALYSIS ===
  'interpret_wave':       require('./technical/interpret_wave'),
  'position_sizing':      require('./technical/position_sizing'),

  // === FUNDAMENTAL ANALYSIS ===
  'classify_moat':        require('./fundamental/classify_moat'),
  'assess_earnings':      require('./fundamental/assess_earnings'),
  'detect_value_trap':    require('./fundamental/detect_value_trap'),

  // === VALUATION ===
  'three_pillar_value':   require('./valuation/three_pillar_value'),

  // === INSTITUTIONAL ===
  'detect_consensus':     require('./institutional/detect_consensus'),

  // === MACRO ===
  'assess_macro':         require('./macro/assess_macro'),

  // === SYNTHESIS ===
  'write_thesis':         require('./synthesis/write_thesis'),
  'compare_to_greats':    require('./synthesis/compare_to_greats'),

  // === LEARNING ===
  'extract_principles':   require('./learning/extract_principles'),
  'adjust_weights':       require('./learning/adjust_weights'),
};

async function invoke(skillName, input) {
  const skill = skills[skillName];
  if (!skill) throw new Error(`Unknown skill: ${skillName}`);
  return skill.execute(input);
}

function listSkills() {
  return Object.keys(skills);
}

module.exports = { invoke, listSkills, skills };
