import { BufferGeometry, Float32BufferAttribute } from 'three';
import { makeGroups } from './geojson-utils';
import { GeoCoord, GeoGroup, GeoShape, GeoType } from './geo-types';

export interface GeoJsonData {
  type: GeoType;
  coordinates: GeoShape[] | GeoShape | GeoCoord;
}

export class GeoJsonGeometry extends BufferGeometry {
  readonly type: string = 'GeoJsonGeometry';
  parameters: { geoJson: GeoJsonData; radius: number; resolution: number };
  geoGroups: GeoGroup[] = [];

  constructor(geoJson: GeoJsonData, radius = 1, resolution = 2) {
    super();

    this.parameters = {
      geoJson,
      radius,
      resolution,
    };

    const groups: GeoGroup[] = (
      {
        Point: makeGroups,
        MultiPoint: makeGroups,
        LineString: makeGroups,
        MultiLineString: makeGroups,
        Polygon: makeGroups,
        MultiPolygon: makeGroups,
      }[geoJson.type] || (() => [])
    )(geoJson.type, geoJson.coordinates, radius, resolution);

    let indices: number[] = [];
    let vertices: number[] = [];
    let groupCnt = 0;
    for (const newG of groups) {
      const prevIndCnt = indices.length;
      const gidx =
        newG?.materialIndex != undefined ? newG?.materialIndex : groupCnt++;
      indices = indices.concat(
        newG.indices.map((idx) => idx + Math.round(vertices.length / 3))
      );
      vertices = vertices.concat(newG.vertices);
      this.addGroup(prevIndCnt, indices.length - prevIndCnt, gidx);
    }

    this.setIndex(indices);
    this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    this.geoGroups = groups;
  }
}
