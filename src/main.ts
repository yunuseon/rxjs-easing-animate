import './styles.css';

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
  pairwise,
  scan,
  shareReplay,
  startWith,
  switchMap,
  switchMapTo,
  takeUntil,
  takeWhile,
  tap,
  toArray
} from "rxjs/operators";
import { easingFunctions } from './configs/easing-functions';

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
    },
    y: {
      edge: edgeY,
      min: minY,
      max: maxY,
      delta: maxY - minY,
    }
  }
};

const drawEdge = (
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point
): void => {
  context.beginPath();
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
  to: Point
): void => {
  const context = graphConfig.renderContext;
  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  context.beginPath();
  context.strokeStyle = "red";
  context.moveTo(xAxis.min + from.x * xAxis.delta, yAxis.min + from.y * yAxis.delta);
  context.lineTo(xAxis.min + to.x * xAxis.delta, yAxis.min + to.y * yAxis.delta);
  context.stroke();
};

const draw = (
  graphConfig: GraphConfig,
  normalizedEdges: Edge[],
  highlightPos: Point | null
): void => {
  const context = graphConfig.renderContext;

  context.clearRect(0, 0, graphConfig.width, graphConfig.height);
  drawGraph(context, graphConfig);

  normalizedEdges.forEach(({ from, to }) => edgeOnGraph(graphConfig, from, to));

  if (highlightPos) {
    edgeOnGraph(graphConfig, { x: graphConfig.x.min, y: highlightPos.y }, highlightPos);
  }
};

const getPointInsideGraph = (event: MouseEvent, graphConfig: GraphConfig): Point | null => {
  const x = event.offsetX;
  const y = event.offsetY;

  const xAxis = graphConfig.x;
  const yAxis = graphConfig.y;

  if (x < xAxis.min || x > xAxis.edge || y < yAxis.edge || y > yAxis.min) return null;

  return {
    x: x,
    y: y
  };
};


const point$ = (from: number, to: number, duration: number, easingFunction: EasingFunction) =>
  defer(() => {
    const delta = Math.abs(to - from);
    return animationFrames().pipe(
      map(frame => frame.elapsed),
      map(
        (elapsed): Point => ({
          x: elapsed,
          y: easingFunction(elapsed, from, delta, duration)
        })
      ),
      startWith({ x: 0, y: from }),
      endWith({ x: duration, y: to }),
      takeWhile(point => point.x < duration)
    );
  });

const pointNormalized$ = (
  from: number,
  to: number,
  duration: number,
  easingFunction: EasingFunction
) =>
  point$(from, to, duration, easingFunction).pipe(
    map(point => ({
      x: point.x / duration,
      y: point.y / to
    }))
  );

const graph$ = (
  graphConfig: GraphConfig,
  from: number,
  to: number,
  duration: number,
  easingFunction: EasingFunction
) =>
  defer(() => {
    const canvas = graphConfig.graphCanvas;
    const context = canvas.getContext("2d");

    if (!context) return EMPTY;

    const mouseEnter$ = fromEvent(canvas, "mouseenter");
    const mouseMove$ = fromEvent(canvas, "mousemove");
    const mouseLeft$ = fromEvent(canvas, "mouseleave");

    const mousePos$ = mouseMove$.pipe(
      map(event => getPointInsideGraph(event as MouseEvent, graphConfig)),
      distinctUntilChanged(),
      takeUntil(mouseLeft$)
    );

    const posInsideGraph$ = mouseEnter$.pipe(
      switchMapTo(mousePos$),
      startWith(null)
    );

    const normalizedEdges$ = pointNormalized$(
      from,
      to,
      duration,
      easingFunction
    ).pipe(
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

    return combineLatest([normalizedEdges$, posInsideGraph$]).pipe(
      tap(([normalizedEdges, highlightPos]) =>
        draw(graphConfig, normalizedEdges, highlightPos)
      )
    );
  });

const init = () => {
  const graphsContainer = document.getElementById('graphs') as HTMLDivElement;
  const durationIndicator = document.getElementById('duration-indicator') as HTMLSpanElement;
  const durationRange = document.getElementById("duration-range") as HTMLInputElement;

  if (!graphsContainer || !durationIndicator || !durationRange) return;

  const duration$ = fromEvent(durationRange, "change").pipe(
    map(event => event.target as HTMLInputElement),
    map(target => target.value),
    startWith(durationRange.value),
    map(value => Number(value)),
    shareReplay(1)
  );

  Object.entries(easingFunctions).forEach(([name, easingFunction]) => {
    const canvas = document.createElement('canvas');

    const graph = document.createElement('div');
    graph.classList.add('graph');

    const graphHeader = document.createElement('div');
    graphHeader.classList.add('graph-header');
    graphHeader.innerText = name;

    graph.appendChild(graphHeader);
    graph.appendChild(canvas);

    graphsContainer.appendChild(graph);

    const graphConfig = getGraphConfig(canvas, 300, 300, 40, 40);

    duration$.pipe(
      tap(duration => durationIndicator.innerText = `${duration}ms`),
      switchMap(duration => graph$(graphConfig, 0, 100, duration, easingFunction))
    ).subscribe();
  });
};

init();