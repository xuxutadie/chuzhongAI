(function (root, factory) {
    const model = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = model;
    }
    if (root) {
        root.IntegerLessonModel = model;
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const challengeAnswers = {
        "number-line": "-2",
        opposite: "5",
        absolute: "7",
        operation: "-3"
    };

    function clampNumber(value) {
        return Math.max(-10, Math.min(10, Math.round(Number(value) || 0)));
    }

    function getOpposite(value) {
        const number = Number(value);
        return number === 0 ? 0 : -number;
    }

    function getAbsoluteDistance(value) {
        return Math.abs(Number(value));
    }

    function calculateMove(start, operation, operand) {
        const first = Number(start);
        const second = Number(operand);
        return operation === "subtract" ? first - second : first + second;
    }

    function checkChallenge(stepId, answer) {
        return challengeAnswers[stepId] === String(answer).trim();
    }

    function getUnlockedStepIndex(completedSteps) {
        const firstIncomplete = completedSteps.findIndex(value => !value);
        if (completedSteps.every(Boolean)) return Math.max(completedSteps.length - 1, 0);
        return firstIncomplete === -1 ? 0 : firstIncomplete;
    }

    return {
        clampNumber,
        getOpposite,
        getAbsoluteDistance,
        calculateMove,
        checkChallenge,
        getUnlockedStepIndex
    };
});
