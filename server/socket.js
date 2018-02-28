// @flow

import socketIo from 'socket.io';
import { omit, difference } from 'lodash';
import { gameReducer } from '../reducers/game';
import { games, saveGameAction, bumpActiveGame } from './db';

import type { GameAction } from '../types/actions';
import type { RoomId } from '../types/api';

export function attachSocket(server: net$Server) {
  const io = socketIo(server);

  io.on('connect', socket => {
    console.log('New socket connection');

    socket.on('subscribe', (roomId: RoomId) => {
      console.log(`[SOCKET] subscribe ${roomId}`);

      const prevRooms = Object.keys(omit(socket.rooms, socket.id));
      const roomsToJoin = difference([roomId], prevRooms);
      const roomsToLeave = difference(prevRooms, [roomId]);

      socket.join(roomsToJoin);
      roomsToLeave.forEach(gameId => socket.leave(gameId));
    });

    socket.on('game-action', (action: GameAction) => {
      // console.log('[SOCKET] game-action', action);

      const { gameId } = action.payload;
      if (!games[gameId]) {
        // NOTE: This message can easily flood the logs if expired games are
        // kept open
        console.error('Received message for missing game', gameId);

        // Notify clients to leave expired game page
        socket.emit('game-removed', gameId);
      } else {
        saveGameAction(action);
        games[gameId] = gameReducer(games[gameId], action);

        // As long as games receive actions they are marked as active
        bumpActiveGame(gameId);

        socket
          .to(gameId)
          // TODO: Filter which actions get sent to `global` if volume is high
          .to('global')
          .broadcast.emit('game-action', action);
      }
    });
  });
}
