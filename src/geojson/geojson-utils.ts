import { GeoCoord, GeoGroup, GeoShape, GeoType, Vec3D } from './geo-types';
import {
  flatten,
  geoDistance,
  geoInterpolate,
  interpolateNumber,
  polar2Cartesian,
} from './geo-utils';

function interpolateLine(lineCoords: GeoShape, maxDegDistance = 1): GeoCoord[] {
  const result: GeoCoord[] = [];

  let prevPnt: GeoCoord | null = null;
  lineCoords.forEach((pnt) => {
    if (prevPnt) {
      const dist = (geoDistance(pnt, prevPnt) * 180) / Math.PI;
      if (dist > maxDegDistance) {
        const geoInterpol = geoInterpolate(prevPnt, pnt);
        const altInterpol =
          prevPnt.length > 2 || pnt.length > 2
            ? interpolateNumber(prevPnt[2] || 0, pnt[2] || 0)
            : null;
        const interpol = altInterpol
          ? (t: number): Vec3D => [...geoInterpol(t), altInterpol(t)]
          : geoInterpol;

        const tStep = 1 / Math.ceil(dist / maxDegDistance);

        let t = tStep;
        while (t < 1) {
          result.push(interpol(t));
          t += tStep;
        }
      }
    }

    result.push((prevPnt = pnt));
  });

  return result;
}

export function genPoint(coords: GeoCoord, r: number): GeoGroup[] {
  const vertices: Vec3D = polar2Cartesian(
    coords[1],
    coords[0],
    r + (coords[2] || 0)
  );
  const indices: number[] = [];

  return [{ vertices, indices, materialIndex: 0 }];
}

export function genMultiPoint(coords: GeoCoord[], r: number): GeoGroup[] {
  const results: GeoGroup[] = [];

  for (const c of coords) {
    results.push(...genPoint(c, r));
  }

  return results;
}

export function genLineString(coords: GeoShape, r: number, resolution: number) {
  const coords3d = interpolateLine(coords, resolution).map(
    ([lng, lat, alt = 0]) => polar2Cartesian(lat, lng, r + alt)
  );

  const vertices = coords3d.flatMap((v) => v);

  const numPoints = Math.round(vertices.length / 3);

  const indices = [];

  for (let vIdx = 1; vIdx < numPoints; vIdx++) {
    indices.push(vIdx - 1, vIdx);
  }

  return [{ vertices, indices, materialIndex: 0 }];
}

export function genMultiLineString(
  coords: GeoShape[],
  r: number,
  resolution: number
): GeoGroup[] {
  const groups = [];

  for (const c of coords) {
    const p = genLineString(c, r, resolution);
    groups.push(...p);
  }

  return groups;
}

export function genPolygon(
  coords: GeoShape[],
  r: number,
  resolution: number
): GeoGroup[] {
  const coords3d = coords.map((coordsSegment) =>
    interpolateLine(coordsSegment, resolution).map(([lng, lat, alt = 0]) =>
      polar2Cartesian(lat, lng, r + alt)
    )
  );

  const { vertices, holes } = flatten(coords3d);

  const firstHoleIdx = holes[0] || Infinity;
  const outerVertices = vertices.slice(0, firstHoleIdx * 3);
  const holeVertices = vertices.slice(firstHoleIdx * 3);

  const holesIdx = new Set(holes);

  const numPoints = Math.round(vertices.length / 3);

  const outerIndices = [],
    holeIndices = [];
  for (let vIdx = 1; vIdx < numPoints; vIdx++) {
    if (!holesIdx.has(vIdx)) {
      if (vIdx < firstHoleIdx) {
        outerIndices.push(vIdx - 1, vIdx);
      } else {
        holeIndices.push(vIdx - 1 - firstHoleIdx, vIdx - firstHoleIdx);
      }
    }
  }

  const groups: GeoGroup[] = [
    {
      indices: outerIndices,
      vertices: outerVertices,
      materialIndex: 0,
    },
  ];

  if (holes.length) {
    groups.push({
      indices: holeIndices,
      vertices: holeVertices,
      materialIndex: 1,
    });
  }

  return groups;
}

export function genMultiPolygon(
  coords: GeoShape[][],
  r: number,
  resolution: number
): GeoGroup[] {
  const groups: GeoGroup[] = [];

  for (const c of coords) {
    const p = genPolygon(c, r, resolution);
    groups.push(...p);
  }

  return groups;
}

export function makeGroups(
  type: GeoType,
  coordinates: GeoShape[] | GeoShape | GeoCoord,
  radius: number,
  resolution: number
): GeoGroup[] {
  const groups: GeoGroup[] = (
    {
      Point: genPoint,
      MultiPoint: genMultiPoint,
      LineString: genLineString,
      MultiLineString: genMultiLineString,
      Polygon: genPolygon,
      MultiPolygon: genMultiPolygon,
    }[type] || (() => [])
  )(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinates as any,
    radius,
    resolution
  );

  return groups;
}
