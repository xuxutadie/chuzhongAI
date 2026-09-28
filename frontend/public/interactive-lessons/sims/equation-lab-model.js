(function (root, factory) {
    const model = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = model;
    if (root) root.EquationLabModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const tasks = {
        basic: {
            id: "basic",
            label: "基础",
            originalExpression: "x + 3 = 7",
            expanded: true,
            phase: "ready",
            a: 1,
            b: 3,
            c: 7,
            solution: 4,
            goal: "先消去左边的 +3，让 x 单独留下。",
            concept: "认识方程与等式的基本性质"
        },
        advanced: {
            id: "advanced",
            label: "进阶",
            originalExpression: "2x + 3 = 11",
            expanded: true,
            phase: "ready",
            a: 2,
            b: 3,
            c: 11,
            solution: 4,
            goal: "先消去常数项，再把 x 的系数化为 1。",
            concept: "掌握两步方程的规范解法"
        },
        challenge: {
            id: "challenge",
            label: "挑战",
            originalExpression: "3(x - 2) + 4 = 13",
            expanded: false,
            phase: "grouped",
            a: 3,
            b: -2,
            c: 13,
            solution: 5,
            goal: "先展开括号，再消去常数项，最后把系数化为 1。",
            concept: "处理带括号的一元一次方程"
        }
    };

    function createState(difficultyId) {
        const task = tasks[difficultyId] || tasks.basic;
        return {
            ...task,
            history: [],
            balanced: true,
            solved: task.expanded && task.a === 1 && task.b === 0,
            verified: false,
            invalidExperiment: null
        };
    }

    function cleanNumber(value) {
        const rounded = Math.round(Number(value) * 100) / 100;
        return Object.is(rounded, -0) ? 0 : rounded;
    }

    function formatTerm(coefficient, variable) {
        if (coefficient === 0) return "";
        if (!variable) return String(coefficient);
        if (coefficient === 1) return variable;
        if (coefficient === -1) return `-${variable}`;
        return `${coefficient}${variable}`;
    }

    function formatLeft(a, b) {
        const variableTerm = formatTerm(a, "x");
        if (b === 0) return variableTerm || "0";
        if (!variableTerm) return String(b);
        return `${variableTerm} ${b > 0 ? "+" : "-"} ${Math.abs(b)}`;
    }

    function formatEquation(state) {
        if (state.id === "challenge" && state.phase === "grouped") return state.originalExpression;
        if (state.id === "challenge" && state.phase === "expanded") return "3x - 6 + 4 = 13";
        return `${formatLeft(state.a, state.b)} = ${state.c}`;
    }

    function getSuggestedAction(state) {
        if (state.id === "challenge" && state.phase === "grouped") return { type: "expand" };
        if (state.id === "challenge" && state.phase === "expanded") return { type: "combine" };
        if (state.b !== 0) return { type: "add", value: -state.b };
        if (state.a !== 1) return { type: "divide", value: state.a };
        return { type: "verify" };
    }

    function actionLabel(action) {
        if (action.type === "expand") return "用分配律展开括号";
        if (action.type === "combine") return "组成零对并合并同类项";
        if (action.type === "verify") return "把解代回原方程检验";
        if (action.type === "add") return `两边同时${action.value >= 0 ? "加" : "减"} ${Math.abs(action.value)}`;
        if (action.type === "divide") return `两边同时除以 ${action.value}`;
        return "未知操作";
    }

    function applyAction(state, action, scope) {
        if (scope !== "both") {
            return {
                ...state,
                balanced: false,
                invalidExperiment: { scope, action, label: actionLabel(action) }
            };
        }

        const next = {
            ...state,
            history: [...state.history],
            balanced: true,
            invalidExperiment: null
        };

        if (action.type === "expand" && next.id === "challenge" && next.phase === "grouped") {
            next.phase = "expanded";
            next.history.push({ label: actionLabel(action), equation: formatEquation(next) });
        } else if (action.type === "combine" && next.id === "challenge" && next.phase === "expanded") {
            next.phase = "combined";
            next.expanded = true;
            next.history.push({ label: actionLabel(action), equation: formatEquation(next) });
        } else if (action.type === "add" && next.expanded) {
            next.b = cleanNumber(next.b + action.value);
            next.c = cleanNumber(next.c + action.value);
            next.history.push({ label: actionLabel(action), equation: formatEquation(next) });
        } else if (action.type === "divide" && next.expanded && action.value !== 0) {
            next.a = cleanNumber(next.a / action.value);
            next.b = cleanNumber(next.b / action.value);
            next.c = cleanNumber(next.c / action.value);
            next.history.push({ label: actionLabel(action), equation: formatEquation(next) });
        }

        next.solved = next.expanded && next.a === 1 && next.b === 0;
        return next;
    }

    function splitUnits(value) {
        const amount = Math.abs(Math.round(value));
        return {
            positiveUnits: value > 0 ? amount : 0,
            negativeUnits: value < 0 ? amount : 0
        };
    }

    function getVisualState(state) {
        if (state.id === "challenge" && state.phase === "grouped") {
            return {
                mode: "algebra",
                phase: "grouped",
                left: {
                    groups: Array.from({ length: 3 }, () => ({ variables: 1, negativeUnits: 2 })),
                    loosePositiveUnits: 4
                },
                right: { positiveUnits: 13, negativeUnits: 0 },
                cancelledZeroPairs: 0
            };
        }

        if (state.id === "challenge" && state.phase === "expanded") {
            return {
                mode: "algebra",
                phase: "expanded",
                left: { variables: 3, positiveUnits: 4, negativeUnits: 6 },
                right: { positiveUnits: 13, negativeUnits: 0 },
                cancelledZeroPairs: 0
            };
        }

        const leftUnits = splitUnits(state.b);
        const rightUnits = splitUnits(state.c);
        return {
            mode: state.id === "challenge" ? "algebra" : "balance",
            phase: state.id === "challenge" ? "combined" : "ready",
            left: {
                variables: Math.abs(Math.round(state.a)),
                ...leftUnits
            },
            right: {
                variables: 0,
                ...rightUnits
            },
            cancelledZeroPairs: state.id === "challenge" ? 4 : 0
        };
    }

    function evaluateOriginal(state, x) {
        if (state.id === "challenge") return 3 * (x - 2) + 4;
        if (state.id === "advanced") return 2 * x + 3;
        return x + 3;
    }

    function verifySolution(state, value) {
        const x = Number(value);
        const leftValue = cleanNumber(evaluateOriginal(state, x));
        const rightValue = state.id === "challenge" ? 13 : state.id === "advanced" ? 11 : 7;
        return { correct: leftValue === rightValue && x === state.solution, leftValue, rightValue, x };
    }

    return { tasks, createState, formatEquation, getSuggestedAction, actionLabel, applyAction, getVisualState, verifySolution };
});
