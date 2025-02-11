import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
} from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { CameraControls, useTexture } from '@react-three/drei';
import {
  TextureLoader,
  LineSegments,
  LineBasicMaterial,
  Vector3,
  Mesh,
  Raycaster,
  Spherical,
  Texture,
} from 'three';
import AutocompleteInput from './AutocompleteInput';
import { GeoJsonData, GeoJsonGeometry } from './geojson';
import { graticule10 } from './geojson/graticule';
import {
  computeCentroid,
  Direction,
  direction,
  MAX_EARTH_DISTANCE,
  MinDistance,
  minDistance,
} from './geojson/geo-utils';
import { COUNTRIES_ES } from './coutries';
import {
  ArrowBigDown,
  ArrowBigLeft,
  ArrowBigRight,
  ArrowBigUp,
  Minus,
  Plus,
} from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';

useLoader.preload(TextureLoader, '/earth-day.webp');

const MIN_DISTANCE = 2;
const MAX_DISTANCE = 6;

function linearScale(value: number): string {
  if (value < 0 || value > 1) {
    throw new Error('Value must be between 0 and 1.');
  }

  const colors = [
    '#E5F392',
    '#E4E98C',
    '#E3E087',
    '#E2D681',
    '#E1CC7B',
    '#DFC276',
    '#DFC276',
    '#DEB970',
    '#DDAF6B',
    '#DCA565',
    '#DB9B5F',
    '#DA925A',
    '#D98854',
    '#D87E4E',
    '#D77449',
    '#D66B43',
    '#D4613E',
    '#D35738',
    '#D24D32',
    '#D1442D',
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
  code: string;
};

interface SceneRef {
  selectCountry: (name: string) => CountrySelection;
  zoom: (value: number) => void;
}

interface SceneProps {
  country: string;
}

const Scene = forwardRef<SceneRef, SceneProps>(({ country }, ref) => {
  // const globeMap = useLoader(TextureLoader, '/earth-day.webp');
  useTexture('/earth-day.webp', (texture) => {
    setGlobeMap(texture);
  });
  const [globeMap, setGlobeMap] = useState<Texture | undefined>(undefined);
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

        if (name === country) {
          let shouldCenter = true;
          for (const vertex of vertices) {
            markCountry(vertex, shouldCenter, '#00ff00');
            shouldCenter = false;
          }
          return {
            ok: true,
            distance: 0,
            dx: 0,
            dy: 0,
            code: name,
          } as CountrySelection;
        }

        let distance = Infinity;
        let minDistanceResult: MinDistance | undefined = undefined;
        for (const vertex of vertices) {
          for (const vertex2 of vertices2) {
            const d = minDistance(vertex2, vertex);
            if (d.distance < distance) {
              distance = d.distance;
              minDistanceResult = d;
            }
          }
        }

        const value = Math.min(Math.max(0, distance / MAX_EARTH_DISTANCE), 1);
        const color: string = linearScale(value);

        let shouldCenter = true;
        for (const vertex of vertices) {
          markCountry(vertex, shouldCenter, color);
          shouldCenter = false;
        }

        const [x, y] = direction(minDistanceResult!.v2, minDistanceResult!.v1);

        return {
          ok: true,
          distance,
          dx: x,
          dy: y,
          code: name,
        } as CountrySelection;
      },
      zoom: (value: number) => {
        if (cameraControlsRef.current) {
          cameraControlsRef.current.zoom(value);
        }
      },
    }),
    [country, globeMap]
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

    globeMap!.needsUpdate = true;

    if (!shouldCenter || !cameraControlsRef) {
      return;
    }
    const centroid = computeCentroid(vertices);
    let pointV = new Vector3(centroid[0], centroid[1], centroid[2]);
    pointV = pointV.normalize();
    rotateToPoint(pointV);
  };

  useEffect(() => {
    if (isLoading.current || !globeMap) {
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
          properties: { iso_a2: string };
          geometry: GeoJsonData;
        }) => {
          const geo = new GeoJsonGeometry(geometry, alt);
          const seg = new LineSegments(geo, materials);
          lineObjs.push(seg);
          const vertices = [];
          for (const g of geo.geoGroups) {
            vertices.push(g.vertices);
          }
          names.set(properties?.iso_a2, vertices);
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
  }, [globeMap]);

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

const ArrowDirection = ({ dx, dy }: { dx: Direction; dy: Direction }) => {
  if (dx === 0) {
    if (dy === 1) {
      return <ArrowBigUp />;
    }
    if (dy === -1) {
      return <ArrowBigDown />;
    }
  }

  if (dy === 0) {
    if (dx === 1) {
      return <ArrowBigRight />;
    }
    if (dx === -1) {
      return <ArrowBigLeft />;
    }
  }

  const angle = dx === 1 ? -(dy * 45) : -(dy * 45 + 90);

  return <ArrowBigRight style={{ rotate: `${angle}deg` }} />;
};

const GlobeVisualization = () => {
  const [searchCountry, setSearchCountry] = useState('');
  const sceneRef = useRef<SceneRef | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const namesMap = useRef<Record<string, string>>({});
  const inverseNamesMap = useRef<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [country, setCountry] = useState<string>('');
  const [isWin, setIsWin] = useState(false);
  const [results, setResults] = useState<CountrySelection[]>([]);
  const [shouldRender, setShouldRender] = useState(true);

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

    if (isoCountry === country) {
      setIsWin(true);
    }

    setResults((values) => {
      const newValues = [...values, result];
      newValues.sort((v1, v2) => v1.distance - v2.distance);

      return newValues;
    });
  };

  const _init = () => {
    namesMap.current = COUNTRIES_ES;
    const countries = Object.keys(namesMap.current);
    const inverseMap: Record<string, string> = {};
    for (const country of countries) {
      inverseMap[namesMap.current[country]] = country;
    }
    inverseNamesMap.current = inverseMap;
    setNames(countries);
    const randomCountry =
      countries[Math.floor(Math.random() * countries.length)];

    setCountry(namesMap.current[randomCountry]);
  };

  const resetGame = () => {
    setShouldRender(false);

    setTimeout(() => {
      setIsWin(false);
      setResults([]);
      _init();
      setTimeout(() => {
        setShouldRender(true);
      }, 1000);
    }, 1000);
  };

  useEffect(() => {
    _init();
  }, []);

  const getPrefix = useCallback((value: string) => {
    const iso = namesMap.current[value];

    if (!iso) {
      return null;
    }

    return <ReactCountryFlag countryCode={iso} svg />;
  }, []);

  if (!shouldRender) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="max-w-4xl mx-auto pt-4 flex justify-between">
        <h2 className="text-2xl font-bold">Adivina el País</h2>
        {isWin && (
          <button
            onClick={resetGame}
            className="bg-blue-500 text-white px-4 py-1 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            Reiniciar
          </button>
        )}
      </div>
      <div className="max-w-4xl mx-auto p-4 bg-white shadow-md rounded-lg">
        <div className="flex space-x-2 mb-4">
          <AutocompleteInput
            options={names}
            className="w-full"
            setInputValue={setSearchCountry}
            inputValue={searchCountry}
            disabled={isWin}
            getPrefix={getPrefix}
          />
          <button
            onClick={handleSearchCountry}
            disabled={isLoading || isWin}
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
      <div className="max-w-4xl mx-auto p-4 bg-white shadow-md rounded-lg mt-4 mb-8">
        <table className="w-full">
          <thead>
            <tr>
              <th className="py-2 text-left">País</th>
              <th className="py-2 text-left">Distancia</th>
              <th className="py-2 text-left">Dirección</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr key={index} className="border-t border-gray-300">
                <td className="py-2">{inverseNamesMap.current[result.code]}</td>
                <td className="py-2">~{Math.floor(result.distance)} km</td>
                <td className="py-2">
                  <div className="border-blue-500 border-2  p-1 rounded-md flex w-8 h-8 ">
                    <ArrowDirection dx={result.dx} dy={result.dy} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GlobeVisualization;
