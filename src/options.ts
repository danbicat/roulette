export type WinnerType = 'first' | 'last' | 'firstToN' | 'nToLast' | 'custom';

class Options {
  useSkills: boolean = true;
  winningRank: number = 0;
  winnerType: WinnerType = 'first';
  winnerRankStart: number = 0;
  winnerRankEnd: number = 0;
  autoRecording: boolean = true;
}

const options = new Options();
export default options;
