import { GeoCoord, Vec2D, Vec3D } from './geo-types';

const radians = Math.PI / 180;
const degrees = 180 / Math.PI;
const PI_2 = Math.PI / 2;

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
/** This function is based on d3-geo but with some changes and typing */
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

/** taken from earcut js */
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
