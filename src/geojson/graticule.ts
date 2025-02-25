// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

/** from d3-array */
function range(start, stop, step) {
  (start = +start),
    (stop = +stop),
    (step =
      (n = arguments.length) < 2
        ? ((stop = start), (start = 0), 1)
        : n < 3
        ? 1
        : +step);

  var i = -1,
    n = Math.max(0, Math.ceil((stop - start) / step)) | 0,
    range = new Array(n);

  while (++i < n) {
    range[i] = start + i * step;
  }

  return range;
}

/** ported from d3-geo to be self contained and some fixes to get soft graticule */
const epsilon = 1e-6;

function graticuleX(y0, y1, dy) {
  let y = range(y0, y1 - epsilon, dy).concat(y1);
  return function (x) {
    return y.map(function (y) {
      return [x, y];
    });
  };
}

function graticuleY(x0, x1, dx) {
  var x = range(x0, x1 - epsilon, dx).concat(x1);
  return function (y) {
    return x.map(function (x) {
      return [x, y];
    });
  };
}

export default function graticule() {
  var x1,
    x0,
    X1,
    X0,
    y1,
    y0,
    Y1,
    Y0,
    dx = 10,
    dy = dx,
    DX = 90,
    DY = 360,
    x,
    y,
    X,
    Y,
    precision = 2.5;

  function graticule() {
    return { type: 'MultiLineString', coordinates: lines() };
  }

  function lines() {
    return range(Math.ceil(X0 / DX) * DX, X1, DX)
      .map(X)
      .concat(range(Math.ceil(Y0 / DY) * DY, Y1, DY).map(Y))
      .concat(
        range(Math.ceil(x0 / dx) * dx, x1, dx)
          .filter(function (x) {
            return Math.abs(x % DX) > epsilon;
          })
          .map(x)
      )
      .concat(
        range(Math.ceil(y0 / dy) * dy, y1, dy)
          .filter(function (y) {
            return Math.abs(y % DY) > epsilon;
          })
          .map(y)
      );
  }

  graticule.lines = function () {
    return lines().map(function (coordinates) {
      return { type: 'LineString', coordinates: coordinates };
    });
  };

  graticule.outline = function () {
    return {
      type: 'Polygon',
      coordinates: [
        X(X0).concat(
          Y(Y1).slice(1),
          X(X1).reverse().slice(1),
          Y(Y0).reverse().slice(1)
        ),
      ],
    };
  };

  graticule.extent = function (_) {
    if (!arguments.length) return graticule.extentMinor();
    return graticule.extentMajor(_).extentMinor(_);
  };

  graticule.extentMajor = function (_) {
    if (!arguments.length)
      return [
        [X0, Y0],
        [X1, Y1],
      ];
    (X0 = +_[0][0]), (X1 = +_[1][0]);
    (Y0 = +_[0][1]), (Y1 = +_[1][1]);
    if (X0 > X1) (_ = X0), (X0 = X1), (X1 = _);
    if (Y0 > Y1) (_ = Y0), (Y0 = Y1), (Y1 = _);
    return graticule.precision(precision);
  };

  graticule.extentMinor = function (_) {
    if (!arguments.length)
      return [
        [x0, y0],
        [x1, y1],
      ];
    (x0 = +_[0][0]), (x1 = +_[1][0]);
    (y0 = +_[0][1]), (y1 = +_[1][1]);
    if (x0 > x1) (_ = x0), (x0 = x1), (x1 = _);
    if (y0 > y1) (_ = y0), (y0 = y1), (y1 = _);
    return graticule.precision(precision);
  };

  graticule.step = function (_) {
    if (!arguments.length) return graticule.stepMinor();
    return graticule.stepMajor(_).stepMinor(_);
  };

  graticule.stepMajor = function (_) {
    if (!arguments.length) return [DX, DY];
    (DX = +_[0]), (DY = +_[1]);
    return graticule;
  };

  graticule.stepMinor = function (_) {
    if (!arguments.length) return [dx, dy];
    (dx = +_[0]), (dy = +_[1]);
    return graticule;
  };

  graticule.precision = function (_) {
    if (!arguments.length) return precision;
    precision = +_;
    x = graticuleX(y0, y1, precision);
    y = graticuleY(x0, x1, precision);
    X = graticuleX(Y0, Y1, precision);
    Y = graticuleY(X0, X1, precision);
    return graticule;
  };

  return graticule
    .extentMajor([
      [-180, -90 + epsilon],
      [180, 90 - epsilon],
    ])
    .extentMinor([
      [-180, -90 - epsilon],
      [180, 90 + epsilon],
    ]);
}

export function graticule10() {
  return graticule()();
}
