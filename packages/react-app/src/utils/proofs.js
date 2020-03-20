// import { note, DividendProof, JoinSplitProof } from 'aztec.js';
import secp256k1 from "@aztec/secp256k1";
import moment from 'moment';

import { getFraction, computeRemainderNoteValue } from './note';

export async function calculateWithdrawal(stream, aztec) {
  const {
    currentBalance, lastWithdrawTime, stopTime,
  } = stream;

  const streamZkNote = await aztec.zkNote(currentBalance);

  const remainingStreamLength = moment.duration(
    moment.unix(stopTime).diff(moment.unix(lastWithdrawTime))
    ).asSeconds()
  // withdraw up to now or to end of stream
  const maxWithdrawDuration = moment.duration(
    moment.min(
      moment().startOf('second'),
      moment.unix(stopTime)
    )
    .diff(moment.unix(lastWithdrawTime))
    ).asSeconds();

  console.log("Fraction of way through stream", maxWithdrawDuration/remainingStreamLength)

  const scalingFactor = 1000
  const timeBetweenNotes = Math.floor(remainingStreamLength / streamZkNote.value * scalingFactor)
  const withdrawalValue = Math.floor(maxWithdrawDuration / timeBetweenNotes) * scalingFactor
  const withdrawalDuration = timeBetweenNotes * withdrawalValue / scalingFactor

  console.log("Time between notes:", timeBetweenNotes)
  console.log("constructed withdrawal")
  console.table({
    withdrawalValue,
    remainingBalance: streamZkNote.value,
    withdrawalDuration,
    remainingStreamLength
  })
  console.table({
    valueFraction: withdrawalValue / streamZkNote.value,
    durationFraction: withdrawalDuration / remainingStreamLength
  })


  return {
    withdrawalValue,
    withdrawalDuration
  }
}


export async function buildDividendProof(stream, streamContractAddress, withdrawalValue, aztec) {
  const { recipient, currentBalance } = stream;

  const payee = await aztec.user(recipient);

  const streamZkNote = await aztec.zkNote(currentBalance);
  const streamNote = await streamZkNote.export();

  const ratio = getFraction(withdrawalValue / streamZkNote.value)

  const withdrawPayment = computeRemainderNoteValue(
    streamZkNote.value,
    ratio.numerator,
    ratio.denominator,
  );

  const withdrawPaymentNote = await aztec.note.create(
    payee.spendingPublicKey,
    withdrawPayment.expectedNoteValue,
  );
  
  // We use a disposable public key as only the note value is relevant
  const remainderNote = await aztec.note.create(
    secp256k1.generateAccount().publicKey,
    withdrawPayment.remainder,
  );

  const proofData = new aztec.DividendProof(
    streamNote,
    remainderNote,
    withdrawPaymentNote,
    streamContractAddress,
    ratio.numerator,
    ratio.denominator,
  );

  return { proofData, inputNotes: [streamNote], outputNotes: [withdrawPaymentNote, remainderNote] };
}

export async function buildJoinSplitProof(
  stream,
  streamContractAddress,
  streamNote,
  withdrawPaymentNote,
  aztec,
) {
  const { sender, recipient } = stream;

  const payer = await aztec.user(sender);
  const payee = await aztec.user(recipient);
  const changeValue = Math.max(streamNote.k.toNumber() - withdrawPaymentNote.k.toNumber(), 0);

  const changeNote = await aztec.note.create(
    secp256k1.generateAccount().publicKey,
    changeValue,
    [{ address: payer.address, linkedPublicKey: payer.linkedPublicKey },
      { address: payee.address, linkedPublicKey: payee.linkedPublicKey }],
    streamContractAddress,
  );

  const proofData = new aztec.JoinSplitProof(
    [streamNote],
    [withdrawPaymentNote, changeNote],
    streamContractAddress,
    0, // No transfer from private to public assets or vice versa
    recipient,
  );

  return { proofData, inputNotes: [streamNote], outputNotes: [withdrawPaymentNote, changeNote] };
}
