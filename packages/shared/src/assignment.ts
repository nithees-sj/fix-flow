/**
 * Technician recommendation scoring (pure, explainable).
 *
 *   score = skillComponent − workloadPenalty
 *   skillComponent = 40 + 10·level  when the technician has the work order's category skill, else 0
 *   workloadPenalty = 8 · openJobs  (ASSIGNED / IN_PROGRESS / ON_HOLD)
 *
 * Unavailable or suspended technicians are excluded. Ties break on fewer open jobs, then name.
 */

export interface TechnicianCandidate {
  userId: string;
  name: string;
  isAvailable: boolean;
  isActive: boolean;
  openJobs: number;
  skills: { categoryId: string; level: number }[];
}

export interface TechnicianRecommendation {
  userId: string;
  name: string;
  score: number;
  openJobs: number;
  skillLevel: number | null;
  reasons: string[];
}

export function rankTechnicians(
  candidates: TechnicianCandidate[],
  categoryId: string | null,
  categoryName?: string,
): TechnicianRecommendation[] {
  return candidates
    .filter((c) => c.isActive && c.isAvailable)
    .map((c) => {
      const skill = categoryId ? c.skills.find((s) => s.categoryId === categoryId) : undefined;
      const skillComponent = skill ? 40 + 10 * skill.level : 0;
      const workloadPenalty = 8 * c.openJobs;
      const reasons: string[] = [];
      if (skill) reasons.push(`${categoryName ?? 'Category'} skill · level ${skill.level}`);
      else if (categoryId) reasons.push(`No ${categoryName ?? 'category'} skill on profile`);
      reasons.push(c.openJobs === 0 ? 'No open jobs' : `${c.openJobs} open job${c.openJobs === 1 ? '' : 's'}`);
      return {
        userId: c.userId,
        name: c.name,
        score: skillComponent - workloadPenalty,
        openJobs: c.openJobs,
        skillLevel: skill?.level ?? null,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score || a.openJobs - b.openJobs || a.name.localeCompare(b.name));
}

/**
 * Auto-assign picks the top candidate only when they actually hold the needed skill;
 * otherwise the work order stays OPEN for a manager to triage.
 */
export function pickAutoAssignee(ranked: TechnicianRecommendation[]): TechnicianRecommendation | null {
  const top = ranked[0];
  return top && top.skillLevel !== null ? top : null;
}
