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

interface Point {
  x: number;
  y: number;
}

interface Edge {
  from: Point;
  to: Point;
}

interface GraphConfig {
  graphCanvas: HTMLCanvasElement,
  renderContext: CanvasRenderingContext2D,
  offscreenCanvas: HTMLCanvasElement,
  offscreenRenderContext: CanvasRenderingContext2D,
  height: number;
  width: number;
  x: AxisConfig;
  y: AxisConfig;
}

interface AxisConfig {
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

const getGraphConfig = (
  graphCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number
): GraphConfig => {
  const edgeX = width - offsetX;
  const minX = offsetX;
  const maxX = edgeX - offsetX - 8;

  const edgeY = offsetY;
  const minY = height - offsetY;
  const maxY = edgeY + offsetY + 8;

  graphCanvas.height = height;
  graphCanvas.width = width;

  const renderContext = graphCanvas.getContext("2d", { alpha: false });
  if (!renderContext) {
    throw new Error('Please check why canvas does not have a 2d render context');
  }

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = graphCanvas.width;
  offscreenCanvas.height = graphCanvas.height;

  const offscreenRenderContext = offscreenCanvas.getContext('2d');
  if (!offscreenRenderContext) {
    throw new Error('Please check why canvas does not have a 2d render context');
  }

  return {
    graphCanvas: graphCanvas,
    renderContext: renderContext,
    offscreenCanvas: offscreenCanvas,
    offscreenRenderContext: offscreenRenderContext,
    height: height,
    width: width,
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

const drawEdge = (
  graphConfig: GraphConfig,
  from: Point,
  to: Point
): void => {
  const context = graphConfig.renderContext;

  context.beginPath();
  context.setLineDash([]);
  context.strokeStyle = "#000000";
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
};

const drawText = (
  graphConfig: GraphConfig,
  text: string,
  point: Point,
  color = '#000000'
): void => {
  const context = graphConfig.renderContext;

  context.fillStyle = color;
  context.font = "10px serif";
  context.fillText(text, point.x, point.y);
};

const drawAxis = (graphConfig: GraphConfig): void => {
  const context = graphConfig.renderContext;
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  context.fillStyle = "white";
  context.fillRect(0, 0, graphConfig.width, graphConfig.height);

  drawEdge(graphConfig, { x: xAxis.min, y: yAxis.min }, { x: xAxis.edge, y: yAxis.min });
  drawEdge(graphConfig, { x: xAxis.min, y: yAxis.edge }, { x: xAxis.min, y: yAxis.min });
  drawText(graphConfig, "0", { x: xAxis.min, y: yAxis.min + 10 });
  drawText(graphConfig, "1", { x: xAxis.max, y: yAxis.min + 10 });
  drawText(graphConfig, "t", { x: xAxis.edge - 5, y: yAxis.min + 8 });
  drawText(graphConfig, "v", { x: xAxis.min - 8, y: yAxis.edge + 5 });
  drawText(graphConfig, "1", { x: xAxis.min - 8, y: yAxis.max });
};

const drawFramelines = (graphConfig: GraphConfig, frameTimes: number[]) => {
  const context = graphConfig.renderContext;
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  context.beginPath();
  context.setLineDash([]);
  context.strokeStyle = "#eaeaea";

  frameTimes.forEach(t => {
    const x = xAxis.min + t * xAxis.delta;
    context.moveTo(x, yAxis.edge);
    context.lineTo(x, yAxis.min);
  });

  context.stroke();
};

const edgeOnGraph = (
  graphConfig: GraphConfig,
  from: Point,
  to: Point,
  dashed = false,
  color = '#5F021F'
): void => {
  const context = graphConfig.renderContext;
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  context.beginPath();
  context.strokeStyle = color;
  context.setLineDash(dashed ? [5, 5] : []);
  context.moveTo(xAxis.min + from.x * xAxis.delta, yAxis.min + from.y * yAxis.delta);
  context.lineTo(xAxis.min + to.x * xAxis.delta, yAxis.min + to.y * yAxis.delta);
  context.stroke();
};

const pointOnGraph = (
  graphConfig: GraphConfig,
  point: Point
): void => {
  const context = graphConfig.renderContext;
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  context.beginPath();
  context.fillStyle = "black";
  context.setLineDash([]);
  context.arc(
    xAxis.min + point.x * xAxis.delta,
    yAxis.min + point.y * yAxis.delta,
    1,
    0,
    Math.PI * 2,
    true
  );
  context.strokeStyle = "black";
  context.stroke();
  context.fill();
};

const getCorrespondingPointOnGraph = (
  points: Point[],
  pointInsideGraph: Point | null
) => {
  if (!pointInsideGraph) return null;
  const distances = points.map(point => Math.sqrt(Math.pow(point.x - pointInsideGraph.x, 2) + Math.pow(point.y - pointInsideGraph.y, 2)));
  const minDistance = Math.min(...distances);
  const resultIndex = distances.findIndex(distance => distance === minDistance);
  if (resultIndex === -1) return null;
  return points[resultIndex];
};

const drawGraph = (graphConfig: GraphConfig, edges: Edge[]) => {
  const context = graphConfig.renderContext;
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  context.beginPath();
  context.strokeStyle = '#5F021F';
  context.setLineDash([]);

  edges.forEach(({ from, to }) => {
    context.moveTo(xAxis.min + from.x * xAxis.delta, yAxis.min + from.y * yAxis.delta);
    context.lineTo(xAxis.min + to.x * xAxis.delta, yAxis.min + to.y * yAxis.delta);
  });

  context.stroke();
};

const drawOptimalGraph = (graphConfig: GraphConfig, edges: Edge[]) => {
  const context = graphConfig.renderContext;
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  context.beginPath();
  context.strokeStyle = 'blue';
  context.setLineDash([]);

  edges.forEach(({ from, to }) => {
    context.moveTo(xAxis.min + from.x * xAxis.delta, yAxis.min + from.y * yAxis.delta);
    context.lineTo(xAxis.min + to.x * xAxis.delta, yAxis.min + to.y * yAxis.delta);
  });

  context.stroke();
};

const drawHighlight = (graphConfig: GraphConfig, hightlightPosition: Point | null) => {
  if (!hightlightPosition) {
    return;
  }

  if (hightlightPosition.y < 0) {
    edgeOnGraph(graphConfig, { x: 0, y: -hightlightPosition.y }, { x: hightlightPosition.x, y: -hightlightPosition.y }, true, '#bdbdbd');
    edgeOnGraph(graphConfig, { x: hightlightPosition.x, y: -hightlightPosition.y }, hightlightPosition, true, '#bdbdbd');
  } else {
    edgeOnGraph(graphConfig, { x: 0, y: hightlightPosition.y }, hightlightPosition, true, '#bdbdbd');
    edgeOnGraph(graphConfig, { x: hightlightPosition.x, y: 0 }, hightlightPosition, true, '#bdbdbd');
  }
};

const drawHighlightPosition = (graphConfig: GraphConfig, hightlightPosition: Point | null, animationOptions: AnimationOptions) => {
  if (!hightlightPosition) {
    return;
  }

  const stat = `(${Math.floor(hightlightPosition.x * animationOptions.duration)}, ${Math.floor(hightlightPosition.y * animationOptions.to)})`;

  drawText(
    graphConfig,
    stat,
    { x: graphConfig.width - 10 - graphConfig.renderContext.measureText(stat).width, y: 20 },
    '#bdbdbd'
  );
};

const saveToBuffer = (graphConfig: GraphConfig) => graphConfig.offscreenRenderContext.drawImage(graphConfig.graphCanvas, 0, 0);
const drawBuffer = (graphConfig: GraphConfig) => graphConfig.renderContext.drawImage(graphConfig.offscreenCanvas, 0, 0);

const getPointInside = (event: MouseEvent, graphConfig: GraphConfig): Point => {
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  const x = (event.offsetX - xAxis.min) / xAxis.delta;
  const y = (yAxis.min - event.offsetY) / -yAxis.delta;

  return {
    x: x,
    y: y
  };
};

const graph$ = (
  graphConfig: GraphConfig,
  animationOptions: AnimationOptions,
  renderOptions: RenderOptions
) =>
  defer(() => {
    const canvas = graphConfig.graphCanvas;
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) return EMPTY;

    const mouseEnter$ = fromEvent(canvas, "mouseenter");
    const mouseMove$ = fromEvent(canvas, "mousemove");
    const mouseLeft$ = fromEvent(canvas, "mouseleave");

    const mousePos$ = mouseMove$.pipe(
      map(event => getPointInside(event as MouseEvent, graphConfig)),
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
        (elapsed): Point => ({
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
      scan((acc, curr) => [...acc, curr], [] as Point[]),
      shareReplay(1)
    );

    const highlightPosition$ = combineLatest([
      points$,
      positionInsideGraph$
    ]).pipe(
      map(([points, positionInsideGraph]) => getCorrespondingPointOnGraph(points, positionInsideGraph)),
      distinctUntilChanged((a, b) => a?.x === b?.x && a?.y === b?.y)
    );

    const optimalEdges$ = range(1, animationOptions.duration).pipe(
      map(
        (elapsed): Point => ({
          x: elapsed / animationOptions.duration,
          y: animationOptions.easingFunction(elapsed, animationOptions.from, delta, animationOptions.duration) / animationOptions.to
        })
      ),
      startWith({ x: 0, y: animationOptions.from }),
      takeWhile(point => point.x < 1),
      endWith({ x: 1, y: 1 }),
      pairwise(),
      map(
        ([from, to]): Edge => ({
          from: from,
          to: to
        })
      ),
      reduce((acc, curr) => [...acc, curr], [] as Edge[]),
      shareReplay(1)
    );

    const normalizedEdges$ = point$.pipe(
      pairwise(),
      map(
        ([from, to]): Edge => ({
          from: from,
          to: to
        })
      ),
      scan((acc, curr) => [...acc, curr], [] as Edge[]),
      shareReplay(1)
    );

    const renderHighlights$ = highlightPosition$.pipe(
      tap(highlightPosition => {
        drawBuffer(graphConfig);
        drawHighlight(graphConfig, highlightPosition);
        drawHighlightPosition(graphConfig, highlightPosition, animationOptions);
      })
    );

    return optimalEdges$.pipe(
      switchMap(optimalEdges => normalizedEdges$.pipe(
        tap(edges => {
          drawAxis(graphConfig);

          if (renderOptions.renderFramelines) {
            drawFramelines(graphConfig, edges.map(edge => edge.to.x));
          }

          if (renderOptions.renderOptimal) {
            drawOptimalGraph(graphConfig, optimalEdges);
          }

          drawGraph(graphConfig, edges);

          if (renderOptions.renderPoints) {
            edges.map(edge => edge.to).forEach(point => pointOnGraph(graphConfig, point));
          }

          saveToBuffer(graphConfig);
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
    const canvas = document.createElement('canvas');

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
    graph.appendChild(canvas);

    graphsContainer.appendChild(graph);

    const graphConfig = getGraphConfig(canvas, 300, 300, 20, 40);

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
      switchMap(([animationOptions, renderOptions]) => graph$(graphConfig, animationOptions, renderOptions))
    ).subscribe();
  });
};

init();