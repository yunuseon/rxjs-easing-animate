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

const pointOnGraph = (
  context: CanvasRenderingContext2D,
  point: Point,
  x0: number,
  y0: number,
  xDelta: number,
  yDelta: number
): void => {
  context.beginPath();
  context.fillStyle = "red";
  context.arc(
    x0 + point.x * xDelta,
    y0 + point.y * yDelta,
    1,
    0,
    Math.PI * 2,
    true
  );
  context.strokeStyle = "red";
  context.stroke();
  context.fill();
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

const sineInOut: EasingFunction = (t, b, c, d) => {
  return (-c / 2) * (Math.cos((Math.PI * t) / d) - 1) + b;
};

const easeInOutElastic: EasingFunction = (t, b, c, d) => {
  var s = 1.70158;
  var p = 0;
  var a = c;
  if (t == 0) return b;
  if ((t /= d / 2) == 2) return b + c;
  if (!p) p = d * (0.3 * 1.5);
  if (a < Math.abs(c)) {
    a = c;
    var s = p / 4;
  } else var s = (p / (2 * Math.PI)) * Math.asin(c / a);
  if (t < 1)
    return (
      -0.5 *
      (a *
        Math.pow(2, 10 * (t -= 1)) *
        Math.sin(((t * d - s) * (2 * Math.PI)) / p)) +
      b
    );
  return (
    a *
    Math.pow(2, -10 * (t -= 1)) *
    Math.sin(((t * d - s) * (2 * Math.PI)) / p) *
    0.5 +
    c +
    b
  );
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

const easingFunctions: Record<string, EasingFunction> = {
  easeInOutElastic: easeInOutElastic,
  sineInOut: sineInOut,
};

const selector = document.getElementById(
  "easing-function"
) as HTMLSelectElement;
Object.keys(easingFunctions).forEach(key => {
  const option = document.createElement("option");
  option.value = key;
  option.innerText = key;
  selector.appendChild(option);
});

selector.value = Object.keys(easingFunctions)[0];

const easingFunction$ = fromEvent(selector, "change").pipe(
  map((event: Event) => event.target as HTMLSelectElement),
  filter<HTMLSelectElement>(Boolean),
  map((target: HTMLSelectElement) => target.value),
  startWith(Object.keys(easingFunctions)[0]),
  map(easingFunctionKey => easingFunctions[easingFunctionKey]),
  filter(Boolean)
);

const durationRange = document.getElementById(
  "duration-range"
) as HTMLInputElement;

const duration$ = fromEvent(durationRange, "change").pipe(
  map(event => event.target as HTMLInputElement),
  map(target => target.value),
  startWith(durationRange.value),
  map(value => Number(value))
);

const graphVariables$ = combineLatest([
  of(0),
  of(100),
  duration$,
  easingFunction$
]);

const canvasElement = document.getElementById("graph") as HTMLCanvasElement;
const graphConfig = getGraphConfig(canvasElement, 400, 400, 20, 40);

graphVariables$
  .pipe(
    switchMap(([from, to, duration, easingFunction]) =>
      graph$(graphConfig, from, to, duration, easingFunction)
    )
  )
  .subscribe();
