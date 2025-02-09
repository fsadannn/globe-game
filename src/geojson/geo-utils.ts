import { GeoCoord, Vec2D, Vec3D } from './geo-types';

const radians = Math.PI / 180;
const degrees = 180 / Math.PI;
const PI_2 = Math.PI / 2;
const EARTH_RADIO = 6371;
export const MAX_EARTH_DISTANCE = 6371 * Math.PI;

function asin(x: number): number {
  if (x > 1) {
    return PI_2;
  } else if (x < -1) {
    return -PI_2;
  } else {
    return Math.asin(x);
  }
}

function haversin(x: number): number {
  const x2 = Math.sin(x / 2);
  return x2 * x;
}

export function polar2Cartesian(lat: number, lng: number, r = 0): Vec3D {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  return [
    r * Math.sin(phi) * Math.cos(theta), // x
    r * Math.cos(phi), // y
    r * Math.sin(phi) * Math.sin(theta), // z
  ];
}

export function cartesianToPolar(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const r = Math.sqrt(x * x + y * y + z * z);
  const phi = Math.acos(y / r);
  const lat = 90 - (phi * 180) / Math.PI;
  const lng = 90 - (Math.acos(x / (r * Math.sin(phi))) * 180) / Math.PI;
  return [lat, lng, r];
}

export function geoInterpolate(a: GeoCoord, b: GeoCoord) {
  const x0 = a[0] * radians;
  const y0 = a[1] * radians;
  const x1 = b[0] * radians;
  const y1 = b[1] * radians;
  const cy0 = Math.cos(y0);
  const sy0 = Math.sin(y0);
  const cy1 = Math.cos(y1);
  const sy1 = Math.sin(y1);
  const kx0 = cy0 * Math.cos(x0);
  const ky0 = cy0 * Math.sin(x0);
  const kx1 = cy1 * Math.cos(x1);
  const ky1 = cy1 * Math.sin(x1);
  const d =
    2 * asin(Math.sqrt(haversin(y1 - y0) + cy0 * cy1 * haversin(x1 - x0)));
  const k = Math.sin(d);

  const interpolate = (t: number): Vec2D => {
    t *= d;
    const B = Math.sin(t) / k;
    const A = Math.sin(d - t) / k;
    const x = A * kx0 + B * kx1;
    const y = A * ky0 + B * ky1;
    const z = A * sy0 + B * sy1;
    return [
      Math.atan2(y, x) * degrees,
      Math.atan2(z, Math.sqrt(x * x + y * y)) * degrees,
    ];
  };

  return interpolate;
}

export function geoDistance(a: GeoCoord, b: GeoCoord) {
  const lambda_a = a[0] * radians;
  const phi_a = a[1] * radians;

  const sinPhi0 = Math.sin(phi_a);
  const cosPhi0 = Math.cos(phi_a);

  const lambda_b = b[0] * radians;
  const phi_b = b[1] * radians;

  const sinPhi = Math.sin(phi_b);
  const cosPhi = Math.cos(phi_b);
  const delta = Math.abs(lambda_b - lambda_a);
  const cosDelta = Math.cos(delta);
  const sinDelta = Math.sin(delta);
  const x = cosPhi * sinDelta;
  const y = cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosDelta;
  const z = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosDelta;
  const d = Math.atan2(Math.sqrt(x * x + y * y), z);

  return d;
}

export function interpolateNumber(a: number, b: number) {
  return (
    (a = +a),
    (b = +b),
    function (t: number) {
      return a * (1 - t) + b * t;
    }
  );
}

export function flatten(data: number[][][]) {
  const vertices: number[] = [];
  const holes: number[] = [];
  const dimensions: number = data[0][0].length;
  let holeIndex = 0;
  let prevLen = 0;

  for (const ring of data) {
    for (const p of ring) {
      for (let d = 0; d < dimensions; d++) vertices.push(p[d]);
    }
    if (prevLen) {
      holeIndex += prevLen;
      holes.push(holeIndex);
    }
    prevLen = ring.length;
  }
  return { vertices, holes, dimensions };
}

function dot(a: Vec3D, b: Vec3D): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(x: Vec3D) {
  return Math.sqrt(dot(x, x));
}

function crossProduct(a: Vec3D, b: Vec3D): Vec3D {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sum(a: Vec3D, b: Vec3D): Vec3D {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3D, b: Vec3D): Vec3D {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function angleBetweenVectors(u: Vec3D, v: Vec3D) {
  if (dot(u, v) < 0) {
    return Math.PI - 2 * Math.asin(norm(sum(u, v)) / 2);
  }

  return 2 * Math.asin(norm(sub(v, u)) / 2);
}

export function normalize(x: Vec3D): Vec3D {
  const normV: number = norm(x);
  return [x[0] / normV, x[1] / normV, x[2] / normV];
}

export function computeCentroid(vertices: number[]) {
  const moment: Vec3D = [0, 0, 0];

  for (let i = 0; i < vertices.length; i += 3) {
    const a: Vec3D = [vertices[i], vertices[i + 1], vertices[i + 2]];
    const b: Vec3D = [
      vertices[(i + 3) % vertices.length],
      vertices[(i + 4) % vertices.length],
      vertices[(i + 5) % vertices.length],
    ];
    if (norm(sub(a, b)) < 1e-6) {
      continue;
    }

    const axb: Vec3D = normalize(crossProduct(a, b));
    const angle: number = angleBetweenVectors(a, b) / 2;
    moment[0] += axb[0] * angle;
    moment[1] += axb[1] * angle;
    moment[2] += axb[2] * angle;
  }

  if (
    angleBetweenVectors(moment, [vertices[0], vertices[1], vertices[2]]) >
    Math.PI / 2
  ) {
    moment[0] = -moment[0];
    moment[1] = -moment[1];
    moment[2] = -moment[2];
  }

  return moment;
}

export function earthGeoDistance(a: Vec3D, b: Vec3D) {
  return angleBetweenVectors(a, b) * EARTH_RADIO;
}

export function minDistance(vertices1: number[], vertices2: number[]): number {
  const v2Initial: Vec3D = [vertices2[0], vertices2[1], vertices2[2]];

  let minV1Vertex: Vec3D = [vertices1[0], vertices1[1], vertices1[2]];
  let minDistance: number = Infinity;
  for (let i = 0; i < vertices1.length; i += 3) {
    const a: Vec3D = [vertices1[i], vertices1[i + 1], vertices1[i + 2]];
    const distance = earthGeoDistance(a, v2Initial);
    if (distance < minDistance) {
      minDistance = distance;
      minV1Vertex = a;
    }
  }

  for (let i = 0; i < vertices2.length; i += 3) {
    const a: Vec3D = [vertices2[i], vertices2[i + 1], vertices2[i + 2]];
    const distance = earthGeoDistance(a, minV1Vertex);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

export type Direction = 0 | 1 | -1;

export function direction(v1: Vec3D, v2: Vec3D): [Direction, Direction] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lat1, lon1, _] = cartesianToPolar(v1[0], v1[1], v1[2]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lat2, lon2, __] = cartesianToPolar(v2[0], v2[1], v2[2]);
  const lat1Min = lat1 - 5;
  const lat1Max = lat1 + 5;
  const lon1Min = lon1 - 5;
  const lon1Max = lon1 + 5;

  console.log(lat1, lon1);
  console.log([lat1Min, lat1Max], [lon1Min, lon1Max]);
  console.log(lat2, lon2);

  let x = 0;
  let y = 0;

  if (lat2 > lat1Max) {
    y = 1;
  } else if (lat2 < lat1Min) {
    y = -1;
  }

  if (lon2 > lon1Max) {
    x = 1;
  } else if (lon2 < lon1Min) {
    x = -1;
  }

  if (x == 0 && y == 0) {
    const yd = Math.abs(lat1 - lat2);
    const xd = Math.abs(lon1 - lon2);

    if (xd < yd) {
      y = lat1 > lat2 ? -1 : 1;
    } else {
      x = lon1 > lon2 ? -1 : 1;
    }
  }

  return [x, y];
}
