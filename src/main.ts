import './styles.css';
import '../assets/refresh.svg';

import { EasingFunction } from './types/easing-function';
import {
  defer,
  fromEvent,
  animationFrames,
  combineLatest,
  range,
  NEVER
} from "rxjs";
import {
  distinctUntilChanged,
  endWith,
  map,
  mapTo,
  pairwise,
  reduce,
  scan,
  shareReplay,
  startWith,
  switchMap,
  switchMapTo,
  takeUntil,
  takeWhile,
  tap
} from "rxjs/operators";
import { easingFunctions } from './configs/easing-functions';

interface RenderOptions {
  renderPoints: boolean;
  renderCoords: boolean;
  renderOptimal: boolean;
  renderEffective: boolean;
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

interface Axis {
  min: number;
  max: number;
  edge: number;
  delta: number;
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

const createGraph = (width: number, height: number): Graph => {
  const offsetXLeft = 0.05 * width;
  const offsetXRight = 0.02 * width;

  const offsetYTop = 0.05 * height
  const offsetYBottom = 0.08 * height

  const edgeX = width - offsetXRight;
  const minX = offsetXLeft;
  const maxX = edgeX - 20;

  const edgeY = offsetYTop;
  const minY = height - offsetYBottom;
  const maxY = edgeY + offsetYTop + 8;

  return {
    x: {
      edge: edgeX,
      min: minX,
      max: maxX,
      delta: maxX - minX
    },
    y: {
      edge: edgeY,
      min: minY,
      max: maxY,
      delta: maxY - minY
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

const drawFramelines = (screen: Screen, xCoordinates: number[]): void => {
  const framelines = xCoordinates.map(x => ({
    from: { x: x, y: 1 },
    to: { x: x, y: 0 }
  }));

  drawLines(screen, framelines, '#eaeaea');
};

const drawLines = (screen: Screen, lines: Line[], color: string, dashSegments: number[] = []): void => {
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

const drawCoordinates = (screen: Screen, coordinates: Coordinate[], color: string): void => {
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

const closestCoordinate = (
  coordinates: Coordinate[],
  pivot: Coordinate | null
): Coordinate | null => {
  if (!pivot) return null;

  const distances = coordinates.map(point => Math.sqrt(Math.pow(point.x - pivot.x, 2) + Math.pow(point.y - pivot.y, 2)));
  const minDistance = Math.min(...distances);
  const resultIndex = distances.findIndex(distance => distance === minDistance);

  if (resultIndex === -1) return null;

  return coordinates[resultIndex];
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

const drawHighlightHints = (screen: Screen, hightlightCoordinate: Coordinate | null): void => {
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

    const mouseCoordinate$ = mouseMove$.pipe(
      map(event => event as MouseEvent),
      map(event => normalizeCoordinate(screen.graph, event.offsetX, event.offsetY)),
      takeUntil(mouseLeft$),
      endWith(null)
    );

    const pivotCoordinate$ = mouseEnter$.pipe(
      switchMapTo(mouseCoordinate$),
      startWith(null),
      distinctUntilChanged((a, b) => a?.x === b?.x && a?.y === b?.y)
    );

    const valueDelta = Math.abs(animationOptions.to - animationOptions.from);

    const coordinate$ = animationFrames().pipe(
      map(frame => frame.elapsed),
      map((elapsed): Coordinate => ({
        x: elapsed / animationOptions.duration,
        y: animationOptions.easingFunction(elapsed, animationOptions.from, valueDelta, animationOptions.duration) / animationOptions.to
      })),
      startWith({ x: 0, y: animationOptions.from }),
      takeWhile(coordinate => coordinate.x < 1),
      endWith({ x: 1, y: 1 }),
      shareReplay(1)
    );

    const coordinates$ = coordinate$.pipe(
      scan((acc, curr) => [...acc, curr], [] as Coordinate[]),
      shareReplay(1)
    );

    const highlightCoordinate$ = combineLatest([
      coordinates$,
      pivotCoordinate$
    ]).pipe(
      map(([coordinates, positionInsideGraph]) => closestCoordinate(coordinates, positionInsideGraph)),
      distinctUntilChanged((a, b) => a?.x === b?.x && a?.y === b?.y)
    );

    const optimalLines$ = range(1, animationOptions.duration).pipe(
      map((elapsed): Coordinate => ({
        x: elapsed / animationOptions.duration,
        y: animationOptions.easingFunction(elapsed, animationOptions.from, valueDelta, animationOptions.duration) / animationOptions.to
      })),
      startWith({ x: 0, y: animationOptions.from }),
      takeWhile(point => point.x < 1),
      endWith({ x: 1, y: 1 }),
      pairwise(),
      map(([from, to]): Line => ({
        from: from,
        to: to
      })),
      reduce((acc, curr) => [...acc, curr], [] as Line[]),
      shareReplay(1)
    );

    const normalizedLines$ = coordinate$.pipe(
      pairwise(),
      map(([from, to]): Line => ({
        from: from,
        to: to
      })),
      scan((acc, curr) => [...acc, curr], [] as Line[]),
      shareReplay(1)
    );

    const renderHighlights$ = highlightCoordinate$.pipe(
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
            drawFramelines(screen, lines.map(line => line.to.x));
          }

          if (renderOptions.renderOptimal) {
            drawOptimalGraph(screen, optimalLines);
          }

          if (renderOptions.renderEffective) {
            drawGraph(screen, lines);
          }

          if (renderOptions.renderPoints) {
            drawCoordinates(screen, lines.map(line => line.to), '#000000');
          }

          saveToCache(screen);
        })
      )),
      switchMapTo(renderOptions.renderCoords ? renderHighlights$ : NEVER)
    )
  });

const init = () => {
  const elements = {
    renderFramelines: document.getElementById('render-framelines') as HTMLInputElement,
    renderOptimal: document.getElementById('render-optimal') as HTMLInputElement,
    renderEffective: document.getElementById('render-effective') as HTMLInputElement,
    renderPoints: document.getElementById('render-points') as HTMLInputElement,
    renderCoords: document.getElementById('render-coords') as HTMLInputElement,
    graphsContainer: document.getElementById('graphs') as HTMLDivElement,
    durationIndicator: document.getElementById('duration-indicator') as HTMLSpanElement,
    durationRange: document.getElementById("duration-range") as HTMLInputElement,
  } as const;

  if (Object.values(elements).some(element => !element)) {
    const failedElemntIds = Object.entries(elements)
      .filter(([key, element]) => !element)
      .map(([key, element]) => key)
      .join('\n')

    throw new Error(`Could not find elements with ids:\n${failedElemntIds}`)
  }

  const duration$ = fromEvent(elements.durationRange, "change").pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.value),
    startWith(elements.durationRange.value),
    map(value => Number(value)),
    tap(duration => elements.durationIndicator.innerText = `${duration}ms`),
    shareReplay(1)
  );

  const renderPoints$ = fromEvent(elements.renderPoints, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(elements.renderPoints.checked),
    distinctUntilChanged()
  );

  const renderCoords$ = fromEvent(elements.renderCoords, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(elements.renderCoords.checked),
    distinctUntilChanged()
  );

  const renderOptimal$ = fromEvent(elements.renderOptimal, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(elements.renderOptimal.checked),
    distinctUntilChanged()
  );

  const renderEffective$ = fromEvent(elements.renderEffective, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(elements.renderEffective.checked),
    distinctUntilChanged()
  );

  const renderFramelines$ = fromEvent(elements.renderFramelines, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(elements.renderFramelines.checked),
    distinctUntilChanged()
  );

  const renderOptions$ = combineLatest([
    renderPoints$,
    renderCoords$,
    renderOptimal$,
    renderEffective$,
    renderFramelines$
  ]).pipe(
    map(([renderPoints, renderCoords, renderOptimal, renderEffective, renderFramelines]): RenderOptions => ({
      renderPoints: renderPoints,
      renderCoords: renderCoords,
      renderOptimal: renderOptimal,
      renderEffective: renderEffective,
      renderFramelines: renderFramelines
    })),
    shareReplay(1)
  );

  const graphStreams = Object.entries(easingFunctions).map(([name, easingFunction]) => {
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
    elements.graphsContainer.appendChild(graph);

    const animationOptions$ = duration$.pipe(
      map((duration): AnimationOptions => ({
        from: 0,
        to: 100,
        duration: duration,
        easingFunction: easingFunction
      }))
    );

    return fromEvent(refreshBtn, 'click').pipe(
      mapTo(undefined),
      startWith(undefined),
      switchMapTo(combineLatest([animationOptions$, renderOptions$])),
      switchMap(([animationOptions, renderOptions]) => graph$(screen, animationOptions, renderOptions))
    );
  });

  combineLatest(graphStreams).subscribe();
};

init();