/**
 * Sighting clustering — group nearby sightings into hot zones for heatmap UI.
 *
 * Algorithm: greedy single-pass — for each sighting, find first existing cluster
 * within `radiusKm`, merge in (recomputing centroid). Else open new cluster.
 *
 * Marks the cluster with the most sightings as `hottest=true` for UI emphasis.
 */
import { haversineDistance } from "@shared/geo.ts";
import type { SightingApi } from "./lost-pets.ts";

export interface SightingCluster {
  center_lat: number;
  center_lng: number;
  sighting_count: number;
  avg_match_score: number;
  total_match_score: number;
  has_confirmed: boolean;
  earliest_at: string;
  latest_at: string;
  sightings: SightingApi[];
  hottest: boolean;
}

export interface ClusterableSighting {
  id: number;
  sighting_lat: number;
  sighting_lng: number;
  sighting_at?: string;
  created_at?: string;
  ai_match_score?: number;
  status?: string;
  [k: string]: any;
}

export function clusterSightings<T extends ClusterableSighting>(sightings: T[], radiusKm = 0.5): SightingCluster[] {
  const clusters: SightingCluster[] = [];

  for (const s of sightings) {
    if (!s.sighting_lat || !s.sighting_lng) continue;

    let nearest: SightingCluster | null = null;
    for (const c of clusters) {
      const dist = haversineDistance(s.sighting_lat, s.sighting_lng, c.center_lat, c.center_lng);
      if (dist <= radiusKm) {
        nearest = c;
        break;
      }
    }

    const score = Number(s.ai_match_score) || 0;
    const when = s.sighting_at || s.created_at || "";

    if (nearest) {
      nearest.sightings.push(s as any);
      nearest.sighting_count++;
      nearest.total_match_score += score;
      nearest.avg_match_score = Math.round(nearest.total_match_score / nearest.sighting_count);
      // Recompute centroid as simple mean
      const n = nearest.sighting_count;
      nearest.center_lat = (nearest.center_lat * (n - 1) + s.sighting_lat) / n;
      nearest.center_lng = (nearest.center_lng * (n - 1) + s.sighting_lng) / n;
      if (s.status === "confirmed_by_owner") nearest.has_confirmed = true;
      if (when && (!nearest.earliest_at || when < nearest.earliest_at)) nearest.earliest_at = when;
      if (when && (!nearest.latest_at || when > nearest.latest_at)) nearest.latest_at = when;
    } else {
      clusters.push({
        center_lat: s.sighting_lat,
        center_lng: s.sighting_lng,
        sighting_count: 1,
        total_match_score: score,
        avg_match_score: score,
        has_confirmed: s.status === "confirmed_by_owner",
        earliest_at: when,
        latest_at: when,
        sightings: [s as any],
        hottest: false,
      });
    }
  }

  if (clusters.length > 0) {
    const maxCount = Math.max(...clusters.map((c) => c.sighting_count));
    // Tie-break: prefer cluster with confirmed sighting, then highest avg score
    const hottest = clusters
      .filter((c) => c.sighting_count === maxCount)
      .sort((a, b) => {
        if (a.has_confirmed !== b.has_confirmed) return a.has_confirmed ? -1 : 1;
        return b.avg_match_score - a.avg_match_score;
      })[0];
    hottest.hottest = true;
  }

  return clusters.sort((a, b) => {
    if (b.sighting_count !== a.sighting_count) return b.sighting_count - a.sighting_count;
    return b.avg_match_score - a.avg_match_score;
  });
}
