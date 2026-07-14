import { createHash } from 'node:crypto';
import os from 'node:os';

/**
 * Identidade anônima da máquina.
 *
 * Combina hostname + usuário + primeiro MAC não-loopback e devolve um hash.
 * O servidor precisa distinguir "duas máquinas" de "a mesma máquina de novo",
 * mas não precisa saber nada sobre o dono dela — por isso vai o hash, e não os
 * ingredientes. Do hash não se volta para o nome da pessoa nem para o MAC.
 */

/** Primeiro MAC real da máquina. Interfaces internas não servem: são iguais em todo mundo. */
function primeiroMac() {
  const interfaces = Object.values(os.networkInterfaces()).flat();

  const real = interfaces.find(
    (i) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00',
  );

  // Sem MAC utilizável (VM, container), hostname + usuário ainda dão estabilidade.
  return real?.mac ?? 'sem-mac';
}

export function gerarDeviceId() {
  const ingredientes = [os.hostname(), os.userInfo().username, primeiroMac()].join('|');

  return createHash('sha256').update(ingredientes).digest('hex').slice(0, 16);
}
