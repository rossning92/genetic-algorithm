import * as Matter from "matter-js";
import * as p5 from "p5";
import { Pane } from "tweakpane";
import Chart from "chart.js/auto";
import "./main.css";
import { fetchJson, saveAsJson } from "./jsonHelper";
import { params } from "./params";

const startY = 450;
const groundRect = [0, startY + 300, 100000, 100];
const nodeRadius = 12;
const sideLength = 100;
const mutationRate = 0.05;
let GA: GeneticAlgorithm;

{
  const pane: any = new Pane({
    container: document.getElementById("pane"),
  });

  const paramFolder = pane.addFolder({
    title: "Parameters",
  });
  paramFolder.addInput(params, "populationSize", {
    step: 1,
    min: 1,
    max: 128,
  });
  paramFolder.addInput(params, "creatureSegments", {
    step: 1,
    min: 1,
    max: 5,
  });
  paramFolder
    .addButton({
      title: "Restart Evolution",
    })
    .on("click", () => {
      GA.initialize(params.populationSize);
    });
  paramFolder
    .addButton({
      label: "states",
      title: "Save",
    })
    .on("click", () => {
      saveAsJson(GA.dump(), "ga-states.json");
    });
  paramFolder
    .addButton({
      label: "states",
      title: "Load Pretrained",
    })
    .on("click", () => {
      fetchJson("ga-states.json", (generationData) => {
        GA.initialize(params.populationSize, generationData);
        updateChart();
      });
    });

  const playbackFolder = pane.addFolder({
    title: "Playback",
  });

  playbackFolder.addInput(params, "replayMode").on("change", (ev: any) => {
    GA.replayGeneration(ev.value ? params.replayGenIndex : -1);
  });
  playbackFolder.addInput(params, "speedUp", { step: 1, min: 1, max: 100 });
  playbackFolder.addInput(params, "replayGenIndex", { step: 1 });
  playbackFolder
    .addButton({
      title: "Prev",
      label: "replayGeneration",
    })
    .on("click", () => {
      if (params.replayMode) {
        params.replayGenIndex = Math.max(0, params.replayGenIndex - 1);
        GA.replayGeneration(params.replayGenIndex);
        pane.refresh();
      }
    });
  playbackFolder
    .addButton({
      title: "Next",
      label: "replayGeneration",
    })
    .on("click", () => {
      if (params.replayMode) {
        params.replayGenIndex += 1;
        GA.replayGeneration(params.replayGenIndex);
        pane.refresh();
      }
    });

  const uiFolder = pane.addFolder({
    title: "UI",
  });
  uiFolder.addInput(params, "showIndividual", {
    step: 1,
    min: -1,
    max: params.populationSize - 1,
  });
  uiFolder
    .addButton({
      label: "show",
      title: "All",
    })
    .on("click", () => {
      params.showIndividual = -1;
      pane.refresh();
    });
  uiFolder
    .addButton({
      label: "show",
      title: "Best",
    })
    .on("click", () => {
      params.showIndividual = GA.getBestIndex();
      pane.refresh();
    });
  uiFolder.addInput(params, "cameraFollow");
  uiFolder.addInput(params, "cameraMoveSpeed", { min: 0.01, max: 1 });
  uiFolder.addInput(params, "showInfo");
  uiFolder.addInput(params, "showChart").on("change", (ev: any) => {
    const chartCanvas = document.getElementById("chartCanvas");
    chartCanvas.style.display = ev.value ? "block" : "none";
  });
  uiFolder.addInput(params, "showScoreboard");
}

const engine = Matter.Engine.create();

const runner = Matter.Runner.create({ isFixed: true });

function createBodyOptions() {
  return {
    collisionFilter: {
      category: 2,
      group: Matter.Body.nextGroup(false),
      mask: 1,
    },
    friction: 1,
    // frictionAir: 0,
    // restitution: 0.5, // bouncy
  };
}

function createConstraint(bodyA: Matter.Body, bodyB: Matter.Body) {
  return Matter.Constraint.create({
    bodyA,
    bodyB,
    // pointA: { x: 0, y: 0 },
    // pointB: { x: 0, y: 0 },
    stiffness: 1,
    length: getLength(bodyA.position, bodyB.position),
    // damping: 0.1, //don't jiggle around
  });
}

function createCircle(x: number, y: number) {
  return Matter.Bodies.circle(x, y, nodeRadius, {
    ...createBodyOptions(),
    inertia: Infinity,
  });
}

const ground = Matter.Bodies.rectangle(
  groundRect[0],
  groundRect[1],
  groundRect[2],
  groundRect[3],
  {
    isStatic: true,
  }
);

Matter.Composite.add(engine.world, ground);

function getLength(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

class Individual {
  id: number;
  fitness = 0;
  time = 0;
  genes: number[] = [];

  nodes: Matter.Body[] = [];
  edges: Matter.Constraint[] = [];

  constructor(id: number) {
    const segments = params.creatureSegments;

    this.id = id;

    const startX = -0.5 * (segments - 1) * sideLength;
    for (let i = 0; i < segments + 2; i++) {
      this.nodes.push(
        createCircle(
          (sideLength / 2) * i + startX,
          (i % 2 == 0 ? sideLength * 0.866 : 0) + startY
        )
      );
    }

    for (const n of this.nodes) {
      Matter.World.add(engine.world, n);
    }

    for (let i = 0; i < segments; i++) {
      this.edges.push(createConstraint(this.nodes[i], this.nodes[i + 1]));
      this.edges.push(createConstraint(this.nodes[i], this.nodes[i + 2]));
    }
    this.edges.push(
      createConstraint(this.nodes[segments], this.nodes[segments + 1])
    );
    for (const e of this.edges) {
      Matter.World.add(engine.world, e);
    }

    // this.composite = Matter.Composite.add(
    //   engine.world,
    //   this.edges.concat(this.nodes)
    // );
    // console.log(this.composite);

    // Create genes

    for (let j = 0; j < this.edges.length * 3; j++) {
      this.genes[j] = randomFloat(0, 1);
    }
  }

  updateEdges() {
    this.time += 0.01;

    this.edges.forEach((edge: Matter.Constraint, i: number) => {
      const freq = map(this.genes[i], 1, 8);
      const phase = this.genes[i + this.edges.length];
      const scale = map(this.genes[i + this.edges.length * 2], 0, 0.3);

      edge.length =
        sideLength *
        (1 + Math.sin(freq * 2 * Math.PI * (this.time + phase)) * scale);
    });
  }

  update() {
    this.updateEdges();
    this.computeFitness();
  }

  computeFitness() {
    this.fitness = Math.max(...this.nodes.map((x) => x.position.x));
  }

  dispose() {
    for (const n of this.nodes) {
      Matter.World.remove(engine.world, n);
    }
    for (const e of this.edges) {
      Matter.World.remove(engine.world, e);
    }
  }
}

function randomFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function crossover(genes1: number[], genes2: number[]) {
  console.assert(genes1.length == genes2.length);
  var childGenes = new Array(genes1.length);

  let midpoint = Math.floor(Math.random() * childGenes.length);

  for (let i = 0; i < childGenes.length; i++) {
    childGenes[i] = i > midpoint ? genes1[i] : genes2[i];
  }
  return childGenes;
}

function mutate(genes: number[]) {
  return genes.map((x) => (Math.random() < mutationRate ? Math.random() : x));
}

interface GenerationData {
  genes: number[][][];
  bestFitness: number[];
  avgFitness: number[];
}

class GeneticAlgorithm {
  generationData: GenerationData = {
    genes: [],
    bestFitness: [],
    avgFitness: [],
  };
  population: Individual[] = [];
  currentBestFitness = 0;
  populationSize: number;

  private iter = 0;
  private replayGenerationIndex = -1;

  initialize(populationSize: number, generationData?: GenerationData) {
    this.dispose();

    this.populationSize = populationSize;

    if (generationData) {
      this.generationData = generationData;
      this.createPopulation(
        this.generationData.genes[this.generationData.genes.length - 1]
      );
    } else {
      this.generationData = {
        genes: [],
        bestFitness: [],
        avgFitness: [],
      };
      this.createPopulation();
      this.saveGenerationGenes(this.population);
    }
  }

  dispose() {
    this.reset();
    this.destroyPopulation();
  }

  currentGeneration() {
    if (this.replayGenerationIndex >= 0) {
      return this.replayGenerationIndex;
    } else {
      return this.generationData.genes.length - 1;
    }
  }

  getBestIndex() {
    // Assuming poluation is always sorted in descending order.
    return this.population[0].id;
  }

  private saveGenerationGenes(populations: Individual[]) {
    const genes = populations.map((x) => x.genes);
    this.generationData.genes.push(genes);
  }

  private createPopulation(allGenes?: number[][], index?: number) {
    console.assert(this.population.length == 0);
    for (let i = 0; i < this.populationSize; i++) {
      if (index >= 0 && index !== i) continue;

      const creature = new Individual(i);
      if (allGenes) {
        creature.genes = allGenes[i];
      }

      this.population.push(creature);
    }
  }

  private destroyPopulation() {
    // Remove the old population.
    for (const c of this.population) {
      c.dispose();
    }
    this.population.length = 0;
  }

  private selection() {
    this.population.sort((a, b) => b.fitness - a.fitness);
    const maxFitness = this.population[0].fitness;

    // Create mating polls
    const matingPool = [];
    for (const c of this.population) {
      const n = Math.floor((Math.max(c.fitness, 0) / maxFitness) ** 1 * 100);
      for (var j = 0; j < n; j++) {
        matingPool.push(c);
      }
    }

    return matingPool;
  }

  private reproduction(matingPool: Individual[], best: Individual) {
    this.population.length = 0;

    for (let i = 1; i < this.populationSize; i++) {
      // Pick two parents
      let j = Math.floor(Math.random() * matingPool.length);
      let k = Math.floor(Math.random() * matingPool.length);

      // Crossover
      let newGene = crossover(matingPool[j].genes, matingPool[k].genes);

      // Mutation
      newGene = mutate(newGene);

      const c = new Individual(i);
      c.genes = newGene;
      this.population.push(c);
    }

    const c = new Individual(0);
    c.genes = best.genes;
    this.population.push(c);
  }

  private evolve() {
    const matingPool = this.selection();

    const best = this.population[0];

    this.generationData.bestFitness.push(best.fitness);
    this.generationData.avgFitness.push(
      this.population.map((x) => x.fitness).reduce((a, b) => a + b) /
        this.population.length
    );

    updateChart();

    this.destroyPopulation();

    this.reproduction(matingPool, best);
  }

  private reset() {
    this.iter = 0;
    this.currentBestFitness = 0;
  }

  private updateCreatures() {
    for (const c of this.population) {
      c.update();
      this.currentBestFitness = Math.max(this.currentBestFitness, c.fitness);
    }

    // Always sort according to fitness.
    this.population.sort((a, b) => b.fitness - a.fitness);
  }

  replayGeneration(generation: number) {
    if (generation < 0 || generation >= this.generationData.genes.length) {
      console.info("Stop replaying.");

      this.destroyPopulation();
      this.createPopulation(
        this.generationData.genes[this.generationData.genes.length - 1]
      );
      this.reset();

      this.replayGenerationIndex = -1;
    } else {
      console.info(`Replay generation ${generation}.`);

      this.destroyPopulation();
      this.createPopulation(this.generationData.genes[generation]);
      this.reset();

      this.replayGenerationIndex = generation;
    }
  }

  update() {
    // Update physics engine.
    Matter.Runner.tick(runner, engine, 0.01);

    this.updateCreatures();

    this.iter += 1;
    if (this.iter >= maxIterations) {
      if (this.replayGenerationIndex >= 0) {
        this.destroyPopulation();
        this.createPopulation(
          this.generationData.genes[this.replayGenerationIndex]
        );
        this.reset();
      } else {
        this.evolve();
        this.reset();
        this.saveGenerationGenes(this.population);
      }
    }
  }

  dump() {
    return this.generationData;
  }
}

function map(v: number, min: number, max: number) {
  return v * (max - min) + min;
}

const maxIterations = 1000;

/// diagram
let chart: Chart;

function updateChart() {
  chart.data.datasets[0].data = GA.generationData.bestFitness.map(
    (x) => x * 0.01
  );
  chart.data.datasets[1].data = GA.generationData.avgFitness.map(
    (x) => x * 0.01
  );
  chart.data.labels = [...Array(GA.generationData.bestFitness.length)].map(
    (_, i) => (i + 1).toString()
  );
  chart.update();
}

function createChart() {
  const canvas = document.createElement("canvas");
  canvas.id = "chartCanvas";
  canvas.width = 720;
  canvas.height = 480;
  document.body.appendChild(canvas);

  const chartColors = {
    red: "rgb(255, 99, 132)",
    orange: "rgb(255, 159, 64)",
    yellow: "rgb(255, 205, 86)",
    green: "rgb(75, 192, 192)",
    blue: "rgb(54, 162, 235)",
    purple: "rgb(153, 102, 255)",
    grey: "rgb(231,233,237)",
  };

  const ctx = canvas.getContext("2d");

  const data = {
    labels: [] as string[],
    datasets: [
      {
        label: "Best Fitness",
        data: [] as number[],
        backgroundColor: chartColors.red,
        borderColor: chartColors.red,
      },
      {
        label: "Avg Fitness",
        data: [] as number[],
        backgroundColor: chartColors.blue,
        borderColor: chartColors.blue,
      },
    ],
  };

  Chart.defaults.font.size = 18;
  Chart.defaults.color = "#fff";
  Chart.defaults.scales.linear.min = 0;
  chart = new Chart(ctx, {
    type: "line",
    data: data,
    options: {
      responsive: false,
      legend: {
        labels: {
          fontColor: "white",
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Generations",
          },
        },
        y: {
          title: {
            display: true,
            text: "Fitness",
          },
        },
      },
    },
  });
}

createChart();

const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max);

GA = new GeneticAlgorithm();
GA.initialize(params.populationSize);

/// rendering

const sketch = (p: p5) => {
  const canvasWidth = 1920;
  const canvasHeight = 1080;
  const tileSize = 64;
  const margin = 8;

  const palletes = [
    "#e74c3c",
    "#9b59b6",
    "#8e44ad",
    "#3498db",
    "#1abc9c",
    "#2ecc71",
    "#f1c40f",
    "#e67e22",
    "#95a5a6",
  ];

  let img: p5.Image;
  let font: p5.Font;

  function colorAlpha(aColor: string, alpha: number) {
    var c = p.color(aColor);
    return p.color(
      "rgba(" + [p.red(c), p.green(c), p.blue(c), alpha].join(",") + ")"
    );
  }

  let cameraX = 0;

  p.preload = function () {
    img = p.loadImage("tile.png");
    font = p.loadFont("press-start-2p.ttf");
  };

  p.setup = function () {
    p.pixelDensity(1);
    p.createCanvas(canvasWidth, canvasHeight);
    p.textFont(font);
  };

  p.draw = function () {
    for (let i = 0; i < params.speedUp; i++) {
      GA.update();
    }

    p.background(0);

    if (params.showInfo) {
      const textSize = 36;
      let y = 100;

      // Show generation count.
      p.textAlign(p.CENTER, p.CENTER);
      p.noStroke();

      p.fill("white");
      p.textSize(textSize);
      p.text(`Generation ${GA.currentGeneration() + 1}`, canvasWidth * 0.5, y);
      y += textSize + margin;

      // Show individual information.
      if (params.showIndividual >= 0) {
        p.textSize(textSize);
        p.text(`ID=${params.showIndividual}`, canvasWidth * 0.5, y);
      }
      y += textSize + margin;
    }

    {
      p.push();

      {
        // Slowly move camera
        let newCameraX = -canvasWidth * 0.5;

        if (params.cameraFollow) {
          if (params.showIndividual < 0) {
            if (GA.currentBestFitness !== 0) {
              newCameraX += GA.currentBestFitness;
            }
          } else {
            const c = GA.population.filter(
              (x) => x.id == params.showIndividual
            )[0];
            newCameraX += c.fitness;
          }
        }

        cameraX += (newCameraX - cameraX) * params.cameraMoveSpeed;

        p.translate(-cameraX, 0);
      }

      // Draw best fitness.
      if (params.cameraFollow) {
        let x;
        if (params.showIndividual < 0) {
          x = GA.currentBestFitness;
        } else {
          x = GA.population.filter((x) => x.id == params.showIndividual)[0]
            .fitness;
        }
        p.strokeWeight(1);
        p.stroke("gray");
        p.line(x, 0, x, canvasHeight);
        p.textAlign(p.LEFT, p.CENTER);
      }

      // Draw start flag.
      if (1) {
        const height = 400;
        const flagY0 = groundRect[1] - height;

        p.push();
        // p.rectMode(p.CENTER);

        // Flag
        p.fill("green");
        p.triangle(0, flagY0, 100, flagY0 + 50, 0, flagY0 + 100);

        // Stroke
        p.noStroke();
        p.fill("white");
        p.rect(-1, flagY0, 3, height);
        p.strokeWeight(1);
        p.stroke("gray");

        // Text
        p.fill("white");
        p.textSize(14);
        p.textAlign(p.CENTER, p.CENTER);
        p.text("START", 40, flagY0 + 50);

        p.pop();
      }

      // console.log(p.getFrameRate());

      // Draw ground.
      for (
        let x = Math.floor(cameraX / tileSize) * tileSize;
        x < cameraX + canvasWidth;
        x += tileSize
      ) {
        p.image(
          img,
          x,
          groundRect[1] - groundRect[3] * 0.5,
          tileSize,
          tileSize
        );
      }

      // Draw distance labels.
      {
        p.textAlign(p.CENTER, p.TOP);
        p.textSize(32);
        const interval = 500;
        for (
          let x = Math.floor(cameraX / interval) * interval;
          x < cameraX + canvasWidth;
          x += interval
        ) {
          p.text(
            `${(x * 0.01).toFixed()}m`,
            x,
            groundRect[1] - groundRect[3] * 0.5 + tileSize + margin
          );
        }
      }

      // Draw creatures.
      for (const c of GA.population) {
        if (params.showIndividual < 0 || c.id == params.showIndividual) {
          // Draw edges.
          p.stroke("white");
          p.strokeWeight(4);
          for (const e of c.edges) {
            p.line(
              e.bodyA.position.x,
              e.bodyA.position.y,
              e.bodyB.position.x,
              e.bodyB.position.y
            );
          }

          // Draw nodes.
          p.noStroke();
          p.fill(colorAlpha(palletes[c.id % palletes.length], 0.8));
          for (const n of c.nodes) {
            p.circle(n.position.x, n.position.y, nodeRadius * 2);
          }
        }
      }

      p.pop();
    }

    // Draw scoreboard.
    if (params.showScoreboard) {
      const textSize = 18;
      p.fill(p.color("rgba(0,0,0,0.8)"));

      if (params.showIndividual < 0) {
        p.rect(100, 100, 200, (textSize + margin) * GA.population.length);
      }

      p.textAlign(p.LEFT, p.TOP);
      p.noStroke();
      p.fill("white");
      p.textSize(textSize);

      let y = 100;

      p.text("ID", 100, y);
      p.text("Fitness", 200, y);
      y += (textSize + margin) * 2;

      for (const c of GA.population) {
        if (params.showIndividual < 0 || c.id == params.showIndividual) {
          p.text(`${c.id}`, 100, y);
          p.text(`${(c.fitness * 0.01).toFixed(2)}`, 200, y);
          y += textSize + margin;
        }
      }
    }
  };
};

new p5(sketch);
