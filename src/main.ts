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
  EMPTY
} from "rxjs";
import {
  distinctUntilChanged,
  endWith,
  filter,
  finalize,
  map,
  mapTo,
  pairwise,
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

  const renderContext = graphCanvas.getContext("2d");
  if (!renderContext) {
    throw new Error('Please check why canvas does not have a 2d render context');
  }

  return {
    graphCanvas: graphCanvas,
    renderContext: renderContext,
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
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point
): void => {
  context.beginPath();
  context.setLineDash([]);
  context.strokeStyle = "#000000";
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
};

const drawText = (
  context: CanvasRenderingContext2D,
  text: string,
  point: Point
): void => {
  context.fillStyle = "#000000";
  context.font = "10px serif";
  context.fillText(text, point.x, point.y);
};

const drawGraph = (context: CanvasRenderingContext2D, graphConfig: GraphConfig): void => {
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  drawEdge(context, { x: xAxis.min, y: yAxis.min }, { x: xAxis.edge, y: yAxis.min });
  drawEdge(context, { x: xAxis.min, y: yAxis.edge }, { x: xAxis.min, y: yAxis.min });
  drawText(context, "0", { x: xAxis.min, y: yAxis.min + 10 });
  drawText(context, "1", { x: xAxis.max, y: yAxis.min + 10 });
  drawText(context, "t", { x: xAxis.edge - 5, y: yAxis.min + 8 });
  drawText(context, "v", { x: xAxis.min - 8, y: yAxis.edge + 5 });
  drawText(context, "1", { x: xAxis.min - 8, y: yAxis.max });
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
  const distances = points.map(point => Math.sqrt(Math.pow(Math.abs(point.x - pointInsideGraph.x), 2) + Math.pow(Math.abs(point.y - pointInsideGraph.y), 2)));
  const minDistance = Math.min(...distances);
  const resultIndex = distances.findIndex(distance => distance === minDistance);
  if (resultIndex === -1) return null;
  return points[resultIndex];
};

const draw = (
  graphConfig: GraphConfig,
  normalizedEdges: Edge[],
  pointInsideGraph: Point | null,
  renderOptions: RenderOptions
): void => {
  const context = graphConfig.renderContext;

  context.clearRect(0, 0, graphConfig.width, graphConfig.height);
  drawGraph(context, graphConfig);

  normalizedEdges.forEach(({ from, to }) => edgeOnGraph(graphConfig, from, to));

  if (pointInsideGraph) {
    if (pointInsideGraph.y < 0) {
      edgeOnGraph(graphConfig, { x: 0, y: -pointInsideGraph.y }, { x: pointInsideGraph.x, y: -pointInsideGraph.y }, true, '#bdbdbd');
      edgeOnGraph(graphConfig, { x: pointInsideGraph.x, y: -pointInsideGraph.y }, pointInsideGraph, true, '#bdbdbd');
    } else {
      edgeOnGraph(graphConfig, { x: 0, y: pointInsideGraph.y }, pointInsideGraph, true, '#bdbdbd');
      edgeOnGraph(graphConfig, { x: pointInsideGraph.x, y: 0 }, pointInsideGraph, true, '#bdbdbd');
    }
  }

  if (renderOptions.renderPoints) {
    normalizedEdges.map(edge => edge.to).forEach(point => pointOnGraph(graphConfig, point));
  }
};

const getPointInside = (event: MouseEvent, graphConfig: GraphConfig): Point | null => {
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  const x = (event.offsetX - xAxis.min) / xAxis.delta;
  const y = (yAxis.min - event.offsetY) / -yAxis.delta;

  return {
    x: x,
    y: y
  };
};


const animationFrameState$ = (options: AnimationOptions) =>
  defer(() => {
    const delta = Math.abs(options.to - options.from);
    return animationFrames().pipe(
      map(frame => frame.elapsed),
      map(
        (elapsed): Point => ({
          x: elapsed / options.duration,
          y: options.easingFunction(elapsed, options.from, delta, options.duration) / options.to
        })
      ),
      startWith({ x: 0, y: options.from }),
      takeWhile(point => point.x < 1),
      endWith({ x: 1, y: 1 })
    );
  });

const graph$ = (
  graphConfig: GraphConfig,
  animationOptions: AnimationOptions,
  renderOptions: RenderOptions
) =>
  defer(() => {
    const canvas = graphConfig.graphCanvas;
    const context = canvas.getContext("2d");

    if (!context) return EMPTY;

    const mouseEnter$ = fromEvent(canvas, "mouseenter");
    const mouseMove$ = fromEvent(canvas, "mousemove");
    const mouseLeft$ = fromEvent(canvas, "mouseleave");

    const mousePos$ = mouseMove$.pipe(
      map(event => getPointInside(event as MouseEvent, graphConfig)),
      distinctUntilChanged(),
      takeUntil(mouseLeft$),
      endWith(null)
    );

    const positionInsideGraph$ = mouseEnter$.pipe(
      switchMapTo(mousePos$),
      startWith(null)
    );

    const point$ = animationFrameState$(animationOptions).pipe(
      shareReplay(1)
    );

    const points$ = point$.pipe(
      scan((acc, curr) => [...acc, curr], [] as Point[])
    );

    const highlightPosition$ = combineLatest([
      points$,
      positionInsideGraph$
    ]).pipe(
      map(([points, positionInsideGraph]) => getCorrespondingPointOnGraph(points, positionInsideGraph))
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

    return combineLatest([normalizedEdges$, highlightPosition$]).pipe(
      tap(([normalizedEdges, highlightPosition]) =>
        draw(graphConfig, normalizedEdges, highlightPosition, renderOptions)
      )
    );
  });

const init = () => {
  const renderPoints = document.getElementById('render-points') as HTMLInputElement;
  const graphsContainer = document.getElementById('graphs') as HTMLDivElement;
  const durationIndicator = document.getElementById('duration-indicator') as HTMLSpanElement;
  const durationRange = document.getElementById("duration-range") as HTMLInputElement;

  if (!graphsContainer || !durationIndicator || !durationRange || !renderPoints) return;

  const duration$ = fromEvent(durationRange, "change").pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.value),
    startWith(durationRange.value),
    map(value => Number(value)),
    tap(duration => durationIndicator.innerText = `${duration}ms`),
    shareReplay(1)
  );

  const renderPoints$ = fromEvent(renderPoints, 'change').pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.checked),
    startWith(renderPoints.checked),
    distinctUntilChanged(),
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

    const renderOptions$ = renderPoints$.pipe(
      map(renderPoints => ({
        renderPoints: renderPoints
      }))
    )

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