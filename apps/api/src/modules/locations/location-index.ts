import type { LocationType, Tx } from '@fixflow/db';

export interface LocationNode {
  id: string;
  name: string;
  type: LocationType;
  parentId: string | null;
  archivedAt: Date | null;
}

/**
 * In-memory index of an organization's location tree (loaded once per request).
 * Organizations have hundreds to a few thousand locations, so this is cheaper and simpler
 * than recursive SQL for every row we serialize.
 */
export class LocationIndex {
  private readonly byId: Map<string, LocationNode>;

  constructor(nodes: LocationNode[]) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
  }

  static async load(tx: Tx, organizationId: string): Promise<LocationIndex> {
    const nodes = await tx.location.findMany({
      where: { organizationId },
      select: { id: true, name: true, type: true, parentId: true, archivedAt: true },
    });
    return new LocationIndex(nodes);
  }

  get(id: string): LocationNode | undefined {
    return this.byId.get(id);
  }

  ancestors(id: string): LocationNode[] {
    const out: LocationNode[] = [];
    const seen = new Set<string>();
    let cur = this.byId.get(id);
    while (cur && !seen.has(cur.id)) {
      out.unshift(cur);
      seen.add(cur.id);
      cur = cur.parentId ? this.byId.get(cur.parentId) : undefined;
    }
    return out;
  }

  path(id: string | null | undefined): string {
    if (!id) return '';
    return this.ancestors(id).map((n) => n.name).join(' › ');
  }

  /** The location plus all descendants (for "everything in Building A" filters). */
  subtree(id: string): string[] {
    const children = new Map<string, string[]>();
    for (const n of this.byId.values()) {
      if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
    }
    const out: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (out.includes(cur)) continue;
      out.push(cur);
      stack.push(...(children.get(cur) ?? []));
    }
    return out;
  }

  isDescendant(candidateId: string, ancestorId: string): boolean {
    return this.ancestors(candidateId).some((n) => n.id === ancestorId);
  }

  all(): LocationNode[] {
    return [...this.byId.values()];
  }
}
