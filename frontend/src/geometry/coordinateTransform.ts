/**
 * Pure, framework-free coordinate transform functions implementing the chain
 * defined in docs/architecture/coordinate-strategy.md:
 *
 *   project <-> local engineering <-> viewer
 *
 * These functions are the only place the bearing sign convention and axis
 * derivation are resolved. Do not re-derive coordinate math elsewhere.
 */

import type {
  LocalCoordinate,
  LocalFrameDefinition,
  ProjectCoordinate,
  ViewerCoordinate,
  ViewerFrameDefinition,
} from "../domain/coordinates";
import { localCoordinate, projectCoordinate, viewerCoordinate } from "../domain/coordinates";

/**
 * Local +Y (longitudinal) is defined to point along the line bearing,
 * measured clockwise from project/grid north. Local +X (transverse) and
 * local +Y must form a right-handed system with +Z up (X x Y = Z).
 *
 * With bearing beta clockwise from north, the longitudinal direction in
 * (Easting, Northing) is (sin(beta), cos(beta)). Solving X . Y = 0,
 * |X| = 1 and X x Y = Z for a horizontal X gives X = (cos(beta), -sin(beta))
 * as the unique right-handed solution (verified: cos(beta)*cos(beta) -
 * (-sin(beta))*sin(beta) = 1). Expressing a project-space offset in this
 * orthonormal basis is equivalent to a standard CCW rotation of the offset
 * vector by beta.
 */
function localBasis(lineBearingRadians: number): {
  cos: number;
  sin: number;
} {
  return { cos: Math.cos(lineBearingRadians), sin: Math.sin(lineBearingRadians) };
}

export function projectToLocal(
  point: ProjectCoordinate,
  frame: LocalFrameDefinition
): LocalCoordinate {
  const dEasting = point.easting - frame.mastCentreProject.easting;
  const dNorthing = point.northing - frame.mastCentreProject.northing;
  const { cos, sin } = localBasis(frame.lineBearingRadians);

  const x = dEasting * cos - dNorthing * sin;
  const y = dEasting * sin + dNorthing * cos;
  const z = point.elevation - frame.mastCentreProject.elevation;

  return localCoordinate(x, y, z);
}

export function localToProject(
  point: LocalCoordinate,
  frame: LocalFrameDefinition
): ProjectCoordinate {
  const { cos, sin } = localBasis(frame.lineBearingRadians);

  const dEasting = point.x * cos + point.y * sin;
  const dNorthing = -point.x * sin + point.y * cos;

  return projectCoordinate(
    frame.mastCentreProject.easting + dEasting,
    frame.mastCentreProject.northing + dNorthing,
    frame.mastCentreProject.elevation + point.z
  );
}

export function localToViewer(
  point: LocalCoordinate,
  frame: ViewerFrameDefinition
): ViewerCoordinate {
  return viewerCoordinate(
    point.x - frame.renderOriginLocal.x,
    point.y - frame.renderOriginLocal.y,
    point.z - frame.renderOriginLocal.z
  );
}

export function viewerToLocal(
  point: ViewerCoordinate,
  frame: ViewerFrameDefinition
): LocalCoordinate {
  return localCoordinate(
    point.x + frame.renderOriginLocal.x,
    point.y + frame.renderOriginLocal.y,
    point.z + frame.renderOriginLocal.z
  );
}

export function projectToViewer(
  point: ProjectCoordinate,
  localFrame: LocalFrameDefinition,
  viewerFrame: ViewerFrameDefinition
): ViewerCoordinate {
  return localToViewer(projectToLocal(point, localFrame), viewerFrame);
}

export function viewerToProject(
  point: ViewerCoordinate,
  localFrame: LocalFrameDefinition,
  viewerFrame: ViewerFrameDefinition
): ProjectCoordinate {
  return localToProject(viewerToLocal(point, viewerFrame), localFrame);
}
