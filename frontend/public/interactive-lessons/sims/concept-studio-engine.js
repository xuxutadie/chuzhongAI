(function (root, factory) {
    const engine = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = engine;
    if (root) root.ConceptStudioEngine = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
    const signed = (value) => value >= 0 ? `+${value}` : String(value);

    function cubeSection(slice) {
        const cubeVertices = [];
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cubeVertices.push([x, y, z]);
        const edges = [];
        for (let i = 0; i < cubeVertices.length; i++) {
            for (let j = i + 1; j < cubeVertices.length; j++) {
                const differences = cubeVertices[i].filter((value, axis) => value !== cubeVertices[j][axis]).length;
                if (differences === 1) edges.push([cubeVertices[i], cubeVertices[j]]);
            }
        }

        // 切面方程为 x+y+z=c。滑块两端靠近相对的两个顶点，中间穿过立方体中心。
        const planeValue = (Number(slice) - 50) / 35 * 2.55;
        const points = [];
        const addPoint = (point) => {
            if (!points.some((existing) => existing.every((value, axis) => Math.abs(value - point[axis]) < 1e-7))) points.push(point);
        };
        for (const [start, end] of edges) {
            const startDistance = start[0] + start[1] + start[2] - planeValue;
            const endDistance = end[0] + end[1] + end[2] - planeValue;
            if (Math.abs(startDistance) < 1e-8) addPoint([...start]);
            if (Math.abs(endDistance) < 1e-8) addPoint([...end]);
            if (startDistance * endDistance < 0) {
                const ratio = startDistance / (startDistance - endDistance);
                addPoint(start.map((value, axis) => value + (end[axis] - value) * ratio));
            }
        }

        const center = points.reduce((sum, point) => sum.map((value, axis) => value + point[axis]), [0, 0, 0]).map((value) => value / Math.max(1, points.length));
        const basisU = [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0];
        const basisV = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)];
        points.sort((a, b) => {
            const angle = (point) => {
                const relative = point.map((value, axis) => value - center[axis]);
                const u = relative.reduce((sum, value, axis) => sum + value * basisU[axis], 0);
                const v = relative.reduce((sum, value, axis) => sum + value * basisV[axis], 0);
                return Math.atan2(v, u);
            };
            return angle(a) - angle(b);
        });
        const shapeNames = { 3: "三角形", 4: "四边形", 5: "五边形", 6: "六边形" };
        return { planeValue: round(planeValue, 4), vertices: points, vertexCount: points.length, shape: shapeNames[points.length] || "截面" };
    }

    function derive(scene, values) {
        const v = values || {};
        switch (scene) {
            case "shapes":
                return { turn: Number(v.turn), slice: Number(v.slice), ...cubeSection(v.slice) };
            case "numberline":
                return { start: v.value, move: v.move, end: v.value + v.move };
            case "pythagorean": {
                const c = Math.sqrt(v.a * v.a + v.b * v.b);
                return { c: round(c), leftArea: v.a * v.a, rightArea: v.b * v.b, hypotenuseArea: round(c * c) };
            }
            case "function":
            case "function-table":
            case "proportion":
            case "linear": {
                const k = Number(v.k);
                const b = scene === "proportion" ? 0 : Number(v.b || 0);
                return {
                    k,
                    b,
                    expression: `y=${k}x${b === 0 ? "" : signed(b)}`,
                    points: [-2, -1, 0, 1, 2].map((x) => ({ x, y: round(k * x + b) }))
                };
            }
            case "motion":
                return { distance: round(v.speed * v.time), speed: v.speed, time: v.time };
            case "force":
                return { netForce: round(v.force - v.friction), direction: v.force === v.friction ? "平衡" : v.force > v.friction ? "向右" : "向左" };
            case "optics":
            case "optics-review": {
                const incidentRadians = Number(v.angle) * Math.PI / 180;
                const ratio = Math.max(-1, Math.min(1, Math.sin(incidentRadians) / Number(v.index)));
                return { incidenceAngle: Number(v.angle), refractionAngle: round(Math.asin(ratio) * 180 / Math.PI) };
            }
            case "measurement":
                return { reading: round(v.value), scale: Number(v.scale), estimatedDigit: round(Number(v.scale) / 10, 2) };
            case "error": {
                const measuredValue = Number(v.trueValue) + Number(v.error);
                return {
                    measuredValue: round(measuredValue),
                    absoluteError: round(Math.abs(v.error)),
                    relativeError: round(Math.abs(v.error) / Math.abs(v.trueValue) * 100)
                };
            }
            case "probability":
                return { expected: round(v.trials * v.chance / 100), trials: v.trials, chance: v.chance };
            case "area":
                return { area: round(v.a * v.b), perimeter: round(2 * (v.a + v.b)) };
            case "triangle": {
                const side = Math.sqrt(Math.pow(Number(v.a) / 2, 2) + Math.pow(Number(v.height), 2));
                return { area: round(v.a * v.height / 2), equalSide: round(side), angleSum: 180 };
            }
            case "real":
                return { value: round(Math.sqrt(v.radicand), v.precision), lower: Math.floor(Math.sqrt(v.radicand)), upper: Math.ceil(Math.sqrt(v.radicand)) };
            case "coordinate":
                return { x: v.x, y: v.y, quadrant: v.x === 0 || v.y === 0 ? "坐标轴上" : v.x > 0 && v.y > 0 ? "第一象限" : v.x < 0 && v.y > 0 ? "第二象限" : v.x < 0 && v.y < 0 ? "第三象限" : "第四象限" };
            case "transform":
                return { from: { x: 0, y: 0 }, to: { x: v.dx, y: v.dy }, rule: `(x, y) → (x${signed(v.dx)}, y${signed(v.dy)})` };
            case "wave":
            case "sound":
                return { amplitude: v.amplitude, frequency: v.frequency, wavelength: round(8 / v.frequency) };
            default:
                return { ...v };
        }
    }

    return { derive, round, cubeSection };
});
