import './styles.css';
import '../assets/refresh.svg';

import { EasingFunction } from './types/easing-function';
import {
  animationFrameScheduler,
  defer,
  fromEvent,
  interval,
  timer,
  animationFrames,
  combineLatest,
  of,
  EMPTY,
  range,
  NEVER
} from "rxjs";
import {
  distinctUntilChanged,
  endWith,
  filter,
  finalize,
  map,
  mapTo,
  observeOn,
  pairwise,
  reduce,
  scan,
  shareReplay,
  startWith,
  switchMap,
  switchMapTo,
  takeUntil,
  takeWhile,
  tap,
  toArray,
  withLatestFrom
} from "rxjs/operators";
import { easingFunctions } from './configs/easing-functions';

interface RenderOptions {
  renderPoints: boolean;
  renderCoords: boolean;
  renderOptimal: boolean;
  renderFramelines: boolean;
}

interface Coordinate {
  x: number;
  y: number;
}

interface Line {
  from: Coordinate;
  to: Coordinate;
}

interface GraphConfig {
  graphCanvas: HTMLCanvasElement,
  renderContext: CanvasRenderingContext2D,
  offscreenCanvas: HTMLCanvasElement,
  offscreenRenderContext: CanvasRenderingContext2D,
  height: number;
  width: number;
  x: Axis;
  y: Axis;
}

interface Axis {
  min: number;
  max: number;
  edge: number;
  delta: number;
  offset: number;
}

interface AnimationOptions {
  from: number;
  to: number;
  duration: number;
  easingFunction: EasingFunction;
}

interface Buffer {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

const createBuffer = (width: number, height: number): Buffer => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });

  if (!context) {
    throw new Error('Please check why canvas does not have a 2d render context');
  }

  return {
    canvas: canvas,
    context: context
  }
}

interface Screen {
  width: number;
  height: number;
  front: Buffer;
  cache: Buffer;
  graph: Graph;
}

interface Graph {
  x: Axis;
  y: Axis;
}

const createGraph = (
  width: number,
  height: number
) => {
  const offsetX = 0.05 * width;
  const offsetY = 0.12 * height;

  const edgeX = width - offsetX;
  const minX = offsetX;
  const maxX = edgeX - offsetX - 8;

  const edgeY = offsetY;
  const minY = height - offsetY;
  const maxY = edgeY + offsetY + 8;

  return {
    x: {
      edge: edgeX,
      min: minX,
      max: maxX,
      delta: maxX - minX,
      offset: offsetX
    },
    y: {
      edge: edgeY,
      min: minY,
      max: maxY,
      delta: maxY - minY,
      offset: offsetY
    }
  }
};

const createScreen = (width: number, height: number): Screen => ({
  height: height,
  width: width,
  front: createBuffer(width, height),
  cache: createBuffer(width, height),
  graph: createGraph(width, height)
});

const drawCache = (screen: Screen) => screen.front.context.drawImage(screen.cache.canvas, 0, 0);
const saveToCache = (screen: Screen) => screen.cache.context.drawImage(screen.front.canvas, 0, 0);

const drawAxis = (screen: Screen): void => {
  const context = screen.front.context;
  const xAxis = screen.graph.x;
  const yAxis = screen.graph.y;

  context.fillStyle = "white";
  context.fillRect(0, 0, screen.width, screen.height);

  const axisLines = [
    {
      from: normalizeCoordinate(screen.graph, xAxis.min, yAxis.min),
      to: normalizeCoordinate(screen.graph, xAxis.edge, yAxis.min)
    },
    {
      from: normalizeCoordinate(screen.graph, xAxis.min, yAxis.edge),
      to: normalizeCoordinate(screen.graph, xAxis.min, yAxis.min)
    }
  ];

  drawLines(screen, axisLines, '#000000');

  context.fillStyle = '#000000';
  context.font = "10px serif";

  context.fillText("0", xAxis.min, yAxis.min + 10);
  context.fillText("1", xAxis.max, yAxis.min + 10);
  context.fillText("t", xAxis.edge - 5, yAxis.min + 8);
  context.fillText("v", xAxis.min - 8, yAxis.edge + 5);
  context.fillText("1", xAxis.min - 8, yAxis.max);
};

const drawFramelines = (screen: Screen, xCoordinates: number[]) => {
  const framelines = xCoordinates.map(x => ({
    from: { x: x, y: 1 },
    to: { x: x, y: 0 }
  }));

  drawLines(screen, framelines, '#eaeaea');
};

const drawLines = (screen: Screen, lines: Line[], color: string, dashSegments: number[] = []) => {
  const context = screen.front.context;

  context.beginPath();
  context.strokeStyle = color;
  context.setLineDash(dashSegments);

  lines.forEach(({ from, to }) => {
    const absoluteFrom = absoluteCoordinate(screen.graph, from);
    const absoluteTo = absoluteCoordinate(screen.graph, to);

    context.moveTo(absoluteFrom.x, absoluteFrom.y);
    context.lineTo(absoluteTo.x, absoluteTo.y);
  });

  context.stroke();
};

const drawPoints = (screen: Screen, coordinates: Coordinate[], color: string): void => {
  const context = screen.front.context;

  context.fillStyle = color;
  context.strokeStyle = color;

  context.setLineDash([]);

  coordinates
    .map(coordinate => absoluteCoordinate(screen.graph, coordinate))
    .forEach(({ x, y }) => {
      context.beginPath();
      context.arc(x, y, 1, 0, Math.PI * 2, true);
      context.stroke();
      context.fill();
    });
};

const getCorrespondingPointOnGraph = (
  points: Coordinate[],
  pointInsideGraph: Coordinate | null
) => {
  if (!pointInsideGraph) return null;
  const distances = points.map(point => Math.sqrt(Math.pow(point.x - pointInsideGraph.x, 2) + Math.pow(point.y - pointInsideGraph.y, 2)));
  const minDistance = Math.min(...distances);
  const resultIndex = distances.findIndex(distance => distance === minDistance);
  if (resultIndex === -1) return null;
  return points[resultIndex];
};

const drawGraph = (screen: Screen, lines: Line[]): void => drawLines(screen, lines, '#5F021F');

const drawOptimalGraph = (screen: Screen, lines: Line[]): void => drawLines(screen, lines, 'blue');

const getHighlightCoordinateHintLines = (highlightCoordinate: Coordinate): Line[] => {
  if (highlightCoordinate.y < 0) {
    return [
      {
        from: { x: 0, y: -highlightCoordinate.y },
        to: { x: highlightCoordinate.x, y: -highlightCoordinate.y }
      },
      {
        from: { x: highlightCoordinate.x, y: -highlightCoordinate.y },
        to: highlightCoordinate
      },
    ];
  }

  return [
    {
      from: { x: 0, y: highlightCoordinate.y },
      to: highlightCoordinate
    },
    {
      from: { x: highlightCoordinate.x, y: 0 },
      to: highlightCoordinate
    },
  ];
};

const drawHighlightHints = (screen: Screen, hightlightCoordinate: Coordinate | null) => {
  if (!hightlightCoordinate) {
    return;
  }

  const hintLines = getHighlightCoordinateHintLines(hightlightCoordinate);
  drawLines(screen, hintLines, '#bdbdbd', [5, 5]);
};

const drawHighlightPosition = (screen: Screen, hightlightCoordinate: Coordinate | null, animationOptions: AnimationOptions): void => {
  if (!hightlightCoordinate) {
    return;
  }

  const stat = `(${Math.floor(hightlightCoordinate.x * animationOptions.duration)}, ${Math.floor(hightlightCoordinate.y * animationOptions.to)})`;


  const context = screen.front.context;

  context.fillStyle = '#bdbdbd';
  context.font = "10px serif";

  context.fillText(stat, screen.width - 10 - screen.front.context.measureText(stat).width, 20);
};

const normalizeCoordinate = (graph: Graph, absoluteX: number, absoluteY: number): Coordinate => {
  const xAxis = graph.x;
  const yAxis = graph.y;

  return {
    x: (absoluteX - xAxis.min) / xAxis.delta,
    y: (absoluteY - yAxis.min) / yAxis.delta
  };
};

const absoluteCoordinate = (graph: Graph, coordinate: Coordinate): Coordinate => {
  const x = graph.x;
  const y = graph.y;

  return {
    x: x.min + coordinate.x * x.delta,
    y: y.min + coordinate.y * y.delta
  };
};

const graph$ = (
  screen: Screen,
  animationOptions: AnimationOptions,
  renderOptions: RenderOptions
) =>
  defer(() => {
    const mouseEnter$ = fromEvent(screen.front.canvas, "mouseenter");
    const mouseMove$ = fromEvent(screen.front.canvas, "mousemove");
    const mouseLeft$ = fromEvent(screen.front.canvas, "mouseleave");

    const mousePos$ = mouseMove$.pipe(
      map(event => event as MouseEvent),
      map(event => normalizeCoordinate(screen.graph, event.offsetX, event.offsetY)),
      takeUntil(mouseLeft$),
      endWith(null)
    );

    const positionInsideGraph$ = mouseEnter$.pipe(
      switchMapTo(mousePos$),
      startWith(null),
      distinctUntilChanged((a, b) => a?.x === b?.x && a?.y === b?.y)
    );

    const delta = Math.abs(animationOptions.to - animationOptions.from);

    const point$ = animationFrames().pipe(
      map(frame => frame.elapsed),
      map(
        (elapsed): Coordinate => ({
          x: elapsed / animationOptions.duration,
          y: animationOptions.easingFunction(elapsed, animationOptions.from, delta, animationOptions.duration) / animationOptions.to
        })
      ),
      startWith({ x: 0, y: animationOptions.from }),
      takeWhile(point => point.x < 1),
      endWith({ x: 1, y: 1 }),
      shareReplay(1)
    );

    const points$ = point$.pipe(
      scan((acc, curr) => [...acc, curr], [] as Coordinate[]),
      shareReplay(1)
    );

    const highlightPosition$ = combineLatest([
      points$,
      positionInsideGraph$
    ]).pipe(
      map(([points, positionInsideGraph]) => getCorrespondingPointOnGraph(points, positionInsideGraph)),
      distinctUntilChanged((a, b) => a?.x === b?.x && a?.y === b?.y)
    );

    const optimalLines$ = range(1, animationOptions.duration).pipe(
      map(
        (elapsed): Coordinate => ({
          x: elapsed / animationOptions.duration,
          y: animationOptions.easingFunction(elapsed, animationOptions.from, delta, animationOptions.duration) / animationOptions.to
        })
      ),
      startWith({ x: 0, y: animationOptions.from }),
      takeWhile(point => point.x < 1),
      endWith({ x: 1, y: 1 }),
      pairwise(),
      map(
        ([from, to]): Line => ({
          from: from,
          to: to
        })
      ),
      reduce((acc, curr) => [...acc, curr], [] as Line[]),
      shareReplay(1)
    );

    const normalizedLines$ = point$.pipe(
      pairwise(),
      map(
        ([from, to]): Line => ({
          from: from,
          to: to
        })
      ),
      scan((acc, curr) => [...acc, curr], [] as Line[]),
      shareReplay(1)
    );

    const renderHighlights$ = highlightPosition$.pipe(
      tap(highlightCoordinate => {
        drawCache(screen);
        drawHighlightHints(screen, highlightCoordinate);
        drawHighlightPosition(screen, highlightCoordinate, animationOptions);
      })
    );

    return optimalLines$.pipe(
      switchMap(optimalLines => normalizedLines$.pipe(
        tap(lines => {
          drawAxis(screen);

          if (renderOptions.renderFramelines) {
            const xCoordinates = lines.map(line => line.to.x);
            drawFramelines(screen, xCoordinates);
          }

          if (renderOptions.renderOptimal) {
            drawOptimalGraph(screen, optimalLines);
          }

          drawGraph(screen, lines);

          if (renderOptions.renderPoints) {
            drawPoints(screen, lines.map(edge => edge.to), '#000000');
          }

          saveToCache(screen);
        })
      )),
      switchMapTo(renderOptions.renderCoords ? renderHighlights$ : NEVER)
    )
  });

const init = () => {
  const renderFramelinesElement = document.getElementById('render-framelines') as HTMLInputElement;
  const renderOptimalElement = document.getElementById('render-optimal') as HTMLInputElement;
  const renderPointsElement = document.getElementById('render-points') as HTMLInputElement;
  const renderCoordsElement = document.getElementById('render-coords') as HTMLInputElement;
  const graphsContainer = document.getElementById('graphs') as HTMLDivElement;
  const durationIndicator = document.getElementById('duration-indicator') as HTMLSpanElement;
  const durationRange = document.getElementById("duration-range") as HTMLInputElement;

  if (!graphsContainer || !durationIndicator || !durationRange || !renderPointsElement || !renderCoordsElement || !renderOptimalElement || !renderFramelinesElement) return;

  const duration$ = fromEvent(durationRange, "change").pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.value),
    startWith(durationRange.value),
    map(value => Number(value)),
    tap(duration => durationIndicator.innerText = `${duration}ms`),
    shareReplay(1)
  );

  const renderPoints$ = fromEvent(renderPointsElement, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(renderPointsElement.checked),
    distinctUntilChanged()
  );

  const renderCoords$ = fromEvent(renderCoordsElement, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(renderCoordsElement.checked),
    distinctUntilChanged()
  );

  const renderOptimal$ = fromEvent(renderOptimalElement, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(renderOptimalElement.checked),
    distinctUntilChanged()
  );

  const renderFramelines$ = fromEvent(renderFramelinesElement, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(renderFramelinesElement.checked),
    distinctUntilChanged()
  );

  const renderOptions$ = combineLatest([
    renderPoints$,
    renderCoords$,
    renderOptimal$,
    renderFramelines$
  ]).pipe(
    map(([renderPoints, renderCoords, renderOptimal, renderFramelines]) => ({
      renderPoints: renderPoints,
      renderCoords: renderCoords,
      renderOptimal: renderOptimal,
      renderFramelines: renderFramelines
    })),
    shareReplay(1)
  );

  Object.entries(easingFunctions).forEach(([name, easingFunction]) => {
    const screen = createScreen(300, 300);

    const graph = document.createElement('div');
    graph.classList.add('graph');

    const refreshBtn = document.createElement('img');
    refreshBtn.src = './assets/refresh.svg';
    refreshBtn.classList.add('refresh-icon');

    const graphHeader = document.createElement('div');
    graphHeader.classList.add('graph-header');
    graphHeader.innerText = name;
    graphHeader.appendChild(refreshBtn)

    graph.appendChild(graphHeader);
    graph.appendChild(screen.front.canvas);
    graphsContainer.appendChild(graph);

    const animationOptions$ = duration$.pipe(
      map((duration): AnimationOptions => ({
        from: 0,
        to: 100,
        duration: duration,
        easingFunction: easingFunction
      }))
    );

    fromEvent(refreshBtn, 'click').pipe(
      mapTo(undefined),
      startWith(undefined),
      switchMapTo(combineLatest([animationOptions$, renderOptions$])),
      switchMap(([animationOptions, renderOptions]) => graph$(screen, animationOptions, renderOptions))
    ).subscribe();
  });
};

init();