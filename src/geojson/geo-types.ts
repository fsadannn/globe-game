export type Vec3D = [number, number, number];
export type Vec2D = [number, number];

export type GeoCoord = Vec2D | Vec3D;
export type GeoShape = GeoCoord[];
export type GeoGroup = {
  indices: number[];
  vertices: number[];
  materialIndex?: number;
};

export type GeoType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon';
