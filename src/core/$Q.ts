/**
 * The $Q Super-Quick Recognizer (TypeScript version)
 *
 * Original Javascript version:
 *  Nathan Magrofuoco
 *
 * Original $Q authors (C# version):
 *  Radu-Daniel Vatavu, Ph.D.
 *  Lisa Anthony, Ph.D.
 *  Jacob O. Wobbrock, Ph.D.
 *
 * The academic publication for the $Q recognizer, and what should be
 * used to cite it, is:
 *
 *    Vatavu, R.-D., Anthony, L. and Wobbrock, J.O. (2018). $Q: A super-quick,
 *    articulation-invariant stroke-gesture recognizer for low-resource devices.
 *    Proceedings of the ACM Conference on Human-Computer Interaction with Mobile
 *    Devices and Services (MobileHCI '18). Barcelona, Spain (September 3-6, 2018).
 *    New York: ACM Press. Article No. 23.
 *    https://dl.acm.org/citation.cfm?id=3229434.3229465
 *
 * This software is distributed under the "New BSD License" agreement.
 **/

//
// QDollarRecognizer constants
//
const NumPointClouds = 16;
const NumPoints = 32;
const MaxIntCoord = 1024; // (IntX, IntY) range from [0, MaxIntCoord - 1]
const LUTSize = 64; // default size of the lookup table is 64 x 64
const LUTScaleFactor = MaxIntCoord / LUTSize; // used to scale from (IntX, IntY) to LUT

//
// Point class
//
export class Point {
  public X: number;
  public Y: number;
  public ID: number; // stroke ID to which this point belongs (1,2,3,etc.)
  public IntX: number; // for indexing into the LUT
  public IntY: number; // for indexing into the LUT

  constructor(x: number, y: number, id: number) {
    this.X = x;
    this.Y = y;
    this.ID = id;
    this.IntX = 0;
    this.IntY = 0;
  }
}

const Origin = new Point(0, 0, 0);

//
// PointCloud class
//
export class PointCloud {
  public Name: string;
  public Points: Point[];
  public LUT: number[][];

  constructor(name: string, points: Point[]) {
    this.Name = name;
    this.Points = Resample(points, NumPoints);
    this.Points = Scale(this.Points);
    this.Points = TranslateTo(this.Points, Origin);
    this.Points = MakeIntCoords(this.Points); // fills in (IntX, IntY) values
    this.LUT = ComputeLUT(this.Points);
  }
}

//
// Result class
//
export class Result {
  public Name: string;
  public Score: number;
  public Time: number;

  constructor(name: string, score: number, ms: number) {
    this.Name = name;
    this.Score = score;
    this.Time = ms;
  }
}

//
// QDollarRecognizer class
//
export class QDollarRecognizer {
  public PointClouds: PointCloud[];

  constructor() {
    //
    // one predefined point-cloud for each gesture
    //
    this.PointClouds = new Array(NumPointClouds);
    this.PointClouds[0] = new PointCloud("T", [
      new Point(30, 7, 1),
      new Point(103, 7, 1),
      new Point(66, 7, 2),
      new Point(66, 87, 2),
    ]);
    this.PointClouds[1] = new PointCloud("N", [
      new Point(177, 92, 1),
      new Point(177, 2, 1),
      new Point(182, 1, 2),
      new Point(246, 95, 2),
      new Point(247, 87, 3),
      new Point(247, 1, 3),
    ]);
    this.PointClouds[2] = new PointCloud("D", [
      new Point(345, 9, 1),
      new Point(345, 87, 1),
      new Point(351, 8, 2),
      new Point(363, 8, 2),
      new Point(372, 9, 2),
      new Point(380, 11, 2),
      new Point(386, 14, 2),
      new Point(391, 17, 2),
      new Point(394, 22, 2),
      new Point(397, 28, 2),
      new Point(399, 34, 2),
      new Point(400, 42, 2),
      new Point(400, 50, 2),
      new Point(400, 56, 2),
      new Point(399, 61, 2),
      new Point(397, 66, 2),
      new Point(394, 70, 2),
      new Point(391, 74, 2),
      new Point(386, 78, 2),
      new Point(382, 81, 2),
      new Point(377, 83, 2),
      new Point(372, 85, 2),
      new Point(367, 87, 2),
      new Point(360, 87, 2),
      new Point(355, 88, 2),
      new Point(349, 87, 2),
    ]);
    this.PointClouds[3] = new PointCloud("P", [
      new Point(507, 8, 1),
      new Point(507, 87, 1),
      new Point(513, 7, 2),
      new Point(528, 7, 2),
      new Point(537, 8, 2),
      new Point(544, 10, 2),
      new Point(550, 12, 2),
      new Point(555, 15, 2),
      new Point(558, 18, 2),
      new Point(560, 22, 2),
      new Point(561, 27, 2),
      new Point(562, 33, 2),
      new Point(561, 37, 2),
      new Point(559, 42, 2),
      new Point(556, 45, 2),
      new Point(550, 48, 2),
      new Point(544, 51, 2),
      new Point(538, 53, 2),
      new Point(532, 54, 2),
      new Point(525, 55, 2),
      new Point(519, 55, 2),
      new Point(513, 55, 2),
      new Point(510, 55, 2),
    ]);
    this.PointClouds[4] = new PointCloud("X", [
      new Point(30, 146, 1),
      new Point(106, 222, 1),
      new Point(30, 225, 2),
      new Point(106, 146, 2),
    ]);
    this.PointClouds[5] = new PointCloud("H", [
      new Point(188, 137, 1),
      new Point(188, 225, 1),
      new Point(188, 180, 2),
      new Point(241, 180, 2),
      new Point(241, 137, 3),
      new Point(241, 225, 3),
    ]);
    this.PointClouds[6] = new PointCloud("I", [
      new Point(371, 149, 1),
      new Point(371, 221, 1),
      new Point(341, 149, 2),
      new Point(401, 149, 2),
      new Point(341, 221, 3),
      new Point(401, 221, 3),
    ]);
    this.PointClouds[7] = new PointCloud("exclamation", [
      new Point(526, 142, 1),
      new Point(526, 204, 1),
      new Point(526, 221, 2),
    ]);
    this.PointClouds[8] = new PointCloud("line", [new Point(12, 347, 1), new Point(119, 347, 1)]);
    this.PointClouds[9] = new PointCloud("five-point star", [
      new Point(177, 396, 1),
      new Point(223, 299, 1),
      new Point(262, 396, 1),
      new Point(168, 332, 1),
      new Point(278, 332, 1),
      new Point(184, 397, 1),
    ]);
    this.PointClouds[10] = new PointCloud("null", [
      new Point(382, 310, 1),
      new Point(377, 308, 1),
      new Point(373, 307, 1),
      new Point(366, 307, 1),
      new Point(360, 310, 1),
      new Point(356, 313, 1),
      new Point(353, 316, 1),
      new Point(349, 321, 1),
      new Point(347, 326, 1),
      new Point(344, 331, 1),
      new Point(342, 337, 1),
      new Point(341, 343, 1),
      new Point(341, 350, 1),
      new Point(341, 358, 1),
      new Point(342, 362, 1),
      new Point(344, 366, 1),
      new Point(347, 370, 1),
      new Point(351, 374, 1),
      new Point(356, 379, 1),
      new Point(361, 382, 1),
      new Point(368, 385, 1),
      new Point(374, 387, 1),
      new Point(381, 387, 1),
      new Point(390, 387, 1),
      new Point(397, 385, 1),
      new Point(404, 382, 1),
      new Point(408, 378, 1),
      new Point(412, 373, 1),
      new Point(416, 367, 1),
      new Point(418, 361, 1),
      new Point(419, 353, 1),
      new Point(418, 346, 1),
      new Point(417, 341, 1),
      new Point(416, 336, 1),
      new Point(413, 331, 1),
      new Point(410, 326, 1),
      new Point(404, 320, 1),
      new Point(400, 317, 1),
      new Point(393, 313, 1),
      new Point(392, 312, 1),
      new Point(418, 309, 2),
      new Point(337, 390, 2),
    ]);
    this.PointClouds[11] = new PointCloud("arrowhead", [
      new Point(506, 349, 1),
      new Point(574, 349, 1),
      new Point(525, 306, 2),
      new Point(584, 349, 2),
      new Point(525, 388, 2),
    ]);
    this.PointClouds[12] = new PointCloud("pitchfork", [
      new Point(38, 470, 1),
      new Point(36, 476, 1),
      new Point(36, 482, 1),
      new Point(37, 489, 1),
      new Point(39, 496, 1),
      new Point(42, 500, 1),
      new Point(46, 503, 1),
      new Point(50, 507, 1),
      new Point(56, 509, 1),
      new Point(63, 509, 1),
      new Point(70, 508, 1),
      new Point(75, 506, 1),
      new Point(79, 503, 1),
      new Point(82, 499, 1),
      new Point(85, 493, 1),
      new Point(87, 487, 1),
      new Point(88, 480, 1),
      new Point(88, 474, 1),
      new Point(87, 468, 1),
      new Point(62, 464, 2),
      new Point(62, 571, 2),
    ]);
    this.PointClouds[13] = new PointCloud("six-point star", [
      new Point(177, 554, 1),
      new Point(223, 476, 1),
      new Point(268, 554, 1),
      new Point(183, 554, 1),
      new Point(177, 490, 2),
      new Point(223, 568, 2),
      new Point(268, 490, 2),
      new Point(183, 490, 2),
    ]);
    this.PointClouds[14] = new PointCloud("asterisk", [
      new Point(325, 499, 1),
      new Point(417, 557, 1),
      new Point(417, 499, 2),
      new Point(325, 557, 2),
      new Point(371, 486, 3),
      new Point(371, 571, 3),
    ]);
    this.PointClouds[15] = new PointCloud("half-note", [
      new Point(546, 465, 1),
      new Point(546, 531, 1),
      new Point(540, 530, 2),
      new Point(536, 529, 2),
      new Point(533, 528, 2),
      new Point(529, 529, 2),
      new Point(524, 530, 2),
      new Point(520, 532, 2),
      new Point(515, 535, 2),
      new Point(511, 539, 2),
      new Point(508, 545, 2),
      new Point(506, 548, 2),
      new Point(506, 554, 2),
      new Point(509, 558, 2),
      new Point(512, 561, 2),
      new Point(517, 564, 2),
      new Point(521, 564, 2),
      new Point(527, 563, 2),
      new Point(531, 560, 2),
      new Point(535, 557, 2),
      new Point(538, 553, 2),
      new Point(542, 548, 2),
      new Point(544, 544, 2),
      new Point(546, 540, 2),
      new Point(546, 536, 2),
    ]);
  }

  public Recognize(points: Point[]): Result {
    const t0 = Date.now();
    const candidate = new PointCloud("", points);

    let u = -1;
    let b = +Infinity;
    for (
      let i = 0;
      i < this.PointClouds.length;
      i++ // for each point-cloud template
    ) {
      const d = CloudMatch(candidate, this.PointClouds[i], b);
      if (d < b) {
        b = d; // best (least) distance
        u = i; // point-cloud index
      }
    }
    const t1 = Date.now();
    return u == -1
      ? new Result("No match.", 0.0, t1 - t0)
      : new Result(this.PointClouds[u].Name, b > 1.0 ? 1.0 / b : 1.0, t1 - t0);
  }

  public AddGesture(name: string, points: Point[]): number {
    this.PointClouds.push(new PointCloud(name, points));
    let num = 0;
    for (let i = 0; i < this.PointClouds.length; i++) {
      if (this.PointClouds[i].Name == name) num++;
    }
    return num;
  }

  public DeleteUserGestures(): number {
    this.PointClouds.length = NumPointClouds; // clears any beyond the original set
    return NumPointClouds;
  }
}

//
// Private helper functions
//

function CloudMatch(candidate: PointCloud, template: PointCloud, minSoFar: number): number {
  const n = candidate.Points.length;
  const step = Math.floor(Math.pow(n, 0.5));

  const LB1 = ComputeLowerBound(candidate.Points, template.Points, step, template.LUT);
  const LB2 = ComputeLowerBound(template.Points, candidate.Points, step, candidate.LUT);

  for (let i = 0, j = 0; i < n; i += step, j++) {
    if (LB1[j] < minSoFar)
      minSoFar = Math.min(minSoFar, CloudDistance(candidate.Points, template.Points, i, minSoFar));
    if (LB2[j] < minSoFar)
      minSoFar = Math.min(minSoFar, CloudDistance(template.Points, candidate.Points, i, minSoFar));
  }
  return minSoFar;
}

function CloudDistance(pts1: Point[], pts2: Point[], start: number, minSoFar: number): number {
  const n = pts1.length;
  const unmatched: number[] = []; // indices for pts2 that are not matched
  for (let j = 0; j < n; j++) unmatched[j] = j;
  let i = start; // start matching with point 'start' from pts1
  let weight = n; // weights decrease from n to 1
  let sum = 0.0; // sum distance between the two clouds
  do {
    let u = -1;
    let b = +Infinity;
    for (let j = 0; j < unmatched.length; j++) {
      const d = SqrEuclideanDistance(pts1[i], pts2[unmatched[j]]);
      if (d < b) {
        b = d;
        u = j;
      }
    }
    unmatched.splice(u, 1); // remove item at index 'u'
    sum += weight * b;
    if (sum >= minSoFar) return sum; // early abandoning
    weight--;
    i = (i + 1) % n;
  } while (i != start);
  return sum;
}

function ComputeLowerBound(pts1: Point[], pts2: Point[], step: number, LUT: number[][]): number[] {
  const n = pts1.length;
  const LB: number[] = new Array(Math.floor(n / step) + 1);
  const SAT: number[] = new Array(n);
  LB[0] = 0.0;
  for (let i = 0; i < n; i++) {
    const x = Math.round(pts1[i].IntX / LUTScaleFactor);
    const y = Math.round(pts1[i].IntY / LUTScaleFactor);
    const index = LUT[x][y];
    const d = SqrEuclideanDistance(pts1[i], pts2[index]);
    SAT[i] = i == 0 ? d : SAT[i - 1] + d;
    LB[0] += (n - i) * d;
  }
  for (let i = step, j = 1; i < n; i += step, j++) LB[j] = LB[0] + i * SAT[n - 1] - n * SAT[i - 1];
  return LB;
}

function Resample(points: Point[], n: number): Point[] {
  const I = PathLength(points) / (n - 1); // interval length
  let D = 0.0;
  const newpoints = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].ID == points[i - 1].ID) {
      const d = EuclideanDistance(points[i - 1], points[i]);
      if (D + d >= I) {
        const qx = points[i - 1].X + ((I - D) / d) * (points[i].X - points[i - 1].X);
        const qy = points[i - 1].Y + ((I - D) / d) * (points[i].Y - points[i - 1].Y);
        const q = new Point(qx, qy, points[i].ID);
        newpoints.push(q); // append new point 'q'
        points.splice(i, 0, q); // insert 'q' at position i in points s.t. 'q' will be the next i
        D = 0.0;
      } else D += d;
    }
  }
  if (newpoints.length == n - 1)
    // sometimes we fall a rounding-error short of adding the last point, so add it if so
    newpoints.push(
      new Point(
        points[points.length - 1].X,
        points[points.length - 1].Y,
        points[points.length - 1].ID,
      ),
    );
  return newpoints;
}

function Scale(points: Point[]): Point[] {
  let minX = +Infinity,
    maxX = -Infinity,
    minY = +Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    minX = Math.min(minX, points[i].X);
    minY = Math.min(minY, points[i].Y);
    maxX = Math.max(maxX, points[i].X);
    maxY = Math.max(maxY, points[i].Y);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  const newpoints: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const qx = (points[i].X - minX) / size;
    const qy = (points[i].Y - minY) / size;
    newpoints.push(new Point(qx, qy, points[i].ID));
  }
  return newpoints;
}

function TranslateTo(points: Point[], pt: Point): Point[] {
  const c = Centroid(points);
  const newpoints: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const qx = points[i].X + pt.X - c.X;
    const qy = points[i].Y + pt.Y - c.Y;
    newpoints.push(new Point(qx, qy, points[i].ID));
  }
  return newpoints;
}

function Centroid(points: Point[]): Point {
  let x = 0.0,
    y = 0.0;
  for (let i = 0; i < points.length; i++) {
    x += points[i].X;
    y += points[i].Y;
  }
  x /= points.length;
  y /= points.length;
  return new Point(x, y, 0);
}

function PathLength(points: Point[]): number {
  let d = 0.0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].ID == points[i - 1].ID) d += EuclideanDistance(points[i - 1], points[i]);
  }
  return d;
}

function MakeIntCoords(points: Point[]): Point[] {
  for (let i = 0; i < points.length; i++) {
    points[i].IntX = Math.round(((points[i].X + 1.0) / 2.0) * (MaxIntCoord - 1));
    points[i].IntY = Math.round(((points[i].Y + 1.0) / 2.0) * (MaxIntCoord - 1));
  }
  return points;
}

function ComputeLUT(points: Point[]): number[][] {
  const LUT: number[][] = [];
  for (let i = 0; i < LUTSize; i++) LUT[i] = [];

  for (let x = 0; x < LUTSize; x++) {
    for (let y = 0; y < LUTSize; y++) {
      let u = -1;
      let b = +Infinity;
      for (let i = 0; i < points.length; i++) {
        const row = Math.round(points[i].IntX / LUTScaleFactor);
        const col = Math.round(points[i].IntY / LUTScaleFactor);
        const d = (row - x) * (row - x) + (col - y) * (col - y);
        if (d < b) {
          b = d;
          u = i;
        }
      }
      LUT[x][y] = u;
    }
  }
  return LUT;
}

function SqrEuclideanDistance(pt1: Point, pt2: Point): number {
  const dx = pt2.X - pt1.X;
  const dy = pt2.Y - pt1.Y;
  return dx * dx + dy * dy;
}

function EuclideanDistance(pt1: Point, pt2: Point): number {
  const s = SqrEuclideanDistance(pt1, pt2);
  return Math.sqrt(s);
}
