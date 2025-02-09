import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  Suspense,
} from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import {
  TextureLoader,
  LineSegments,
  LineBasicMaterial,
  Vector3,
  Mesh,
  Raycaster,
  Spherical,
} from 'three';
import AutocompleteInput from './AutocompleteInput';
import { GeoJsonData, GeoJsonGeometry } from './geojson';
import { graticule10 } from './geojson/graticule';
import {
  computeCentroid,
  Direction,
  direction,
  earthGeoDistance,
  MAX_EARTH_DISTANCE,
  minDistance,
  normalize,
} from './geojson/geo-utils';
import { COUNTRIES_ES } from './coutries';
import { Minus, Plus } from 'lucide-react';
import { Vec3D } from './geojson/geo-types';

useLoader.preload(TextureLoader, '/earth-day.webp');

const MIN_DISTANCE = 2;
const MAX_DISTANCE = 6;

function linearScale(value: number): string {
  if (value < 0 || value > 1) {
    throw new Error('Value must be between 0 and 1.');
  }

  const colors = [
    '#E5F392',
    '#E2D983',
    '#DFBE73',
    '#DCA464',
    '#D98955',
    '#D66F46',
    '#D35436',
    '#D03A27',
  ].reverse();

  for (let i = colors.length - 1; i >= 0; i--) {
    if (i / colors.length < value) {
      return colors[i];
    }
  }

  return colors[0];
}

type CountrySelection = {
  ok: boolean;
  distance: number;
  dx: Direction;
  dy: Direction;
};

interface SceneRef {
  selectCountry: (name: string) => CountrySelection;
  zoom: (value: number) => void;
}

interface SceneProps {
  country: string;
}

const Scene = forwardRef<SceneRef, SceneProps>(({ country }, ref) => {
  const globeMap = useLoader(TextureLoader, '/earth-day.webp');
  const scene = useThree((state) => state.scene);
  const isLoading = useRef(false);
  const meshRef = useRef<Mesh>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const countryNames = useRef<Map<string, number[][]>>(new Map());
  const cameraControlsRef = useRef<CameraControls | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      selectCountry: (name: string) => {
        const vertices = countryNames.current.get(name);
        const vertices2 = countryNames.current.get(country) || [];

        if (!vertices) {
          return { ok: false } as CountrySelection;
        }

        let distance = Infinity;
        for (const vertex of vertices) {
          for (const vertex2 of vertices2) {
            distance = Math.min(distance, minDistance(vertex2, vertex));
          }
        }

        const value = Math.min(Math.max(0, distance / MAX_EARTH_DISTANCE), 1);
        const color: string = linearScale(value);

        let shouldCenter = true;
        for (const vertex of vertices) {
          markCountry(vertex, shouldCenter, color);
          shouldCenter = false;
        }

        const centroid1 = normalize(computeCentroid(vertices[0]));
        const centroid2 = normalize(computeCentroid(vertices2[0]));
        const [x, y] = direction(centroid1, centroid2);

        return { ok: false, distance, dx: x, dy: y } as CountrySelection;
      },
      zoom: (value: number) => {
        if (cameraControlsRef.current) {
          cameraControlsRef.current.zoom(value);
        }
      },
    }),
    [country]
  );

  const rotateToPoint = (point: Vector3) => {
    if (!cameraControlsRef.current) return;

    // Convert the point to spherical coordinates
    const spherical = new Spherical();
    spherical.setFromVector3(point);

    // Only rotate the camera using azimuthal and polar angles
    cameraControlsRef.current.rotateTo(
      spherical.theta, // azimuthal angle (around y-axis)
      spherical.phi, // polar angle (from y-axis)
      true // enable smooth transition
    );
  };

  const markCountry = (
    vertices: number[],
    shouldCenter = false,
    color: string = '#ff0000'
  ) => {
    if (!meshRef.current || !paintCanvasRef.current) return;

    const ctx = paintCanvasRef.current.getContext('2d');
    const width = paintCanvasRef.current.width;
    const height = paintCanvasRef.current.height;

    if (!ctx) return;

    ctx.beginPath();

    // Get the scene's transformation matrix
    const sceneMatrix = scene.matrixWorld;

    for (let i = 0; i < vertices.length; i += 3) {
      const point = new Vector3(
        vertices[i] * 1.1,
        vertices[i + 1] * 1.1,
        vertices[i + 2] * 1.1
      );
      point.applyMatrix4(sceneMatrix);
      const dir = new Vector3(-vertices[i], -vertices[i + 1], -vertices[i + 2]);
      dir.applyMatrix4(sceneMatrix);
      dir.normalize();

      const ray = new Raycaster(point, dir);
      if (!meshRef.current) {
        continue;
      }
      const it = ray.intersectObject(meshRef.current, false);
      if (it.length === 0) continue;
      const x = it[0].uv!.x * width;
      const y = (1 - it[0].uv!.y) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    globeMap.needsUpdate = true;

    if (!shouldCenter || !cameraControlsRef) {
      return;
    }
    const centroid = computeCentroid(vertices);
    let pointV = new Vector3(centroid[0], centroid[1], centroid[2]);
    pointV = pointV.normalize();
    rotateToPoint(pointV);
  };

  useEffect(() => {
    if (isLoading.current) {
      return;
    }

    const loadGeoJson = async () => {
      const response = await fetch('/world.geo.json');
      const countries = await response.json();

      const alt = 1.001;

      const lineObjs: LineSegments[] = [
        new LineSegments(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new GeoJsonGeometry(graticule10() as any, 1.0005),
          new LineBasicMaterial({
            color: 'white',
            opacity: 0.08,
            transparent: true,
          })
        ),
      ];

      const materials = [
        new LineBasicMaterial({ color: '#044a7d' }), // outer ring
        new LineBasicMaterial({
          color: 'green',
        }), // inner holes
      ];
      const names = new Map<string, number[][]>();
      countries.features.forEach(
        ({
          properties,
          geometry,
        }: {
          properties: { iso_a3: string };
          geometry: GeoJsonData;
        }) => {
          const geo = new GeoJsonGeometry(geometry, alt);
          const seg = new LineSegments(geo, materials);
          lineObjs.push(seg);
          const vertices = [];
          for (const g of geo.geoGroups) {
            vertices.push(g.vertices);
          }
          names.set(properties?.iso_a3, vertices);
        }
      );
      countryNames.current = names;

      lineObjs.forEach((obj) => scene.add(obj));
    };

    if (!paintCanvasRef.current) {
      paintCanvasRef.current = document.createElement('canvas');
      paintCanvasRef.current.width = (
        globeMap.image as HTMLImageElement
      ).naturalWidth;
      paintCanvasRef.current.height = (
        globeMap.image as HTMLImageElement
      ).naturalHeight;
      paintCanvasRef.current
        ?.getContext('2d')
        ?.drawImage(globeMap.image as HTMLImageElement, 0, 0);
      globeMap.image = paintCanvasRef.current;
      globeMap.needsUpdate = true;
    }

    if (meshRef.current) {
      // Rotate the material to match with the countries divisions
      meshRef.current.rotation.set(0, -Math.PI / 2, 0);
    }

    if (cameraControlsRef.current) {
      cameraControlsRef.current.smoothTime = 0.25;
      cameraControlsRef.current.draggingSmoothTime = 0.15;
      cameraControlsRef.current.maxZoom = MAX_DISTANCE;
      cameraControlsRef.current.minZoom = MIN_DISTANCE;
    }

    isLoading.current = true;
    loadGeoJson().finally(() => {
      isLoading.current = false;
    });
  }, []);

  return (
    <>
      <CameraControls ref={cameraControlsRef} minDistance={2} maxDistance={5} />
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial map={globeMap} />
      </mesh>
      <ambientLight intensity={0.5} color="#ffffff" />
    </>
  );
});

const GlobeVisualization = () => {
  const [searchCountry, setSearchCountry] = useState('');
  const sceneRef = useRef<SceneRef | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const namesMap = useRef<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [country, setCountry] = useState<string>('');

  const handleSearchCountry = () => {
    if (!sceneRef || !searchCountry) {
      return;
    }

    const cleanSearch = searchCountry.trim();
    const isoCountry = namesMap.current[cleanSearch];
    setIsLoading(true);
    const result = isoCountry
      ? sceneRef.current?.selectCountry(isoCountry)
      : null;

    if (!result || !result?.ok) {
      setIsLoading(false);
      return;
    }
    setNames((oldNames: string[]) =>
      oldNames.filter((name: string) => name !== cleanSearch)
    );
    setSearchCountry('');
    setIsLoading(false);
  };

  useEffect(() => {
    namesMap.current = COUNTRIES_ES;
    const countries = Object.keys(namesMap.current);
    setNames(countries);
    // const randomCountry =
    //   countries[Math.floor(Math.random() * countries.length)];
    const randomCountry = 'Zimbabue';
    setCountry(namesMap.current[randomCountry]);
    console.log(randomCountry, namesMap.current[randomCountry]);
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 bg-white shadow-md rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Interactive World Globe</h2>
      <div className="flex space-x-2 mb-4">
        <AutocompleteInput
          options={names}
          className="w-full"
          setInputValue={setSearchCountry}
          inputValue={searchCountry}
        />
        <button
          onClick={handleSearchCountry}
          disabled={isLoading}
          className="bg-blue-500 text-white px-4 py-1 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          Seleccionar
        </button>
      </div>

      <div className="w-full h-[500px] bg-gray-100 rounded-lg cursor-move relative">
        <Canvas camera={{ zoom: 3 }}>
          <Scene ref={sceneRef} country={country} />
        </Canvas>
        <div className="w-full absolute top-0">
          <div className="flex w-full justify-between p-4">
            <button
              className="bg-blue-500 text-white px-2 py-1 rounded-md hover:bg-blue-600 transition-colors "
              onClick={() => {
                sceneRef.current?.zoom(-0.2);
              }}
            >
              <Minus />
            </button>
            <button
              className="bg-blue-500 text-white px-2 py-1 rounded-md hover:bg-blue-600 transition-colors"
              onClick={() => {
                sceneRef.current?.zoom(0.2);
              }}
            >
              <Plus />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobeVisualization;
