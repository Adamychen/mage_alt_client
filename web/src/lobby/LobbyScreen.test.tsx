import { describe, expect, it } from 'vitest'
import { extractLobbyUsers } from './LobbyScreen'
import type { RoomUsersView, UsersView } from '../net/types'

describe('extractLobbyUsers', () => {
  it('extracts users when proxy sends Array of RoomUsersView (actual XMage Java proxy format)', () => {
    const raw: RoomUsersView[] = [
      {
        numberActiveGames: 2,
        numberGameThreads: 4,
        numberMaxGames: 100,
        usersView: [
          {
            userName: 'player1',
            flagName: 'US',
            infoGames: 'Modern Duel',
            infoPing: '45ms',
            matchHistory: '10-2',
            matchQuitRatio: 0,
            tourneyHistory: '1-0',
            tourneyQuitRatio: 0,
            generalRating: 1650,
            constructedRating: 1720,
            limitedRating: 1580,
          },
          {
            userName: 'player2',
            flagName: 'ES',
            infoGames: '',
            infoPing: '20ms',
            matchHistory: '5-5',
            matchQuitRatio: 0,
            tourneyHistory: '',
            tourneyQuitRatio: 0,
            generalRating: 1500,
            constructedRating: 1500,
            limitedRating: 1500,
          },
        ],
      },
    ]

    const users = extractLobbyUsers(raw)
    expect(users.length).toBe(2)
    expect(users[0].userName).toBe('player1')
    expect(users[0].flagName).toBe('US')
    expect(users[0].constructedRating).toBe(1720)
    expect(users[1].userName).toBe('player2')
  })

  it('extracts users when proxy sends single RoomUsersView object', () => {
    const raw: RoomUsersView = {
      numberActiveGames: 0,
      numberGameThreads: 0,
      numberMaxGames: 50,
      usersView: [
        {
          userName: 'mage_master',
          flagName: 'DE',
          infoGames: '',
          infoPing: '30ms',
          matchHistory: '20-1',
          matchQuitRatio: 0,
          tourneyHistory: '',
          tourneyQuitRatio: 0,
          generalRating: 1800,
          constructedRating: 1850,
          limitedRating: 1750,
        },
      ],
    }

    const users = extractLobbyUsers(raw)
    expect(users.length).toBe(1)
    expect(users[0].userName).toBe('mage_master')
  })

  it('extracts users when array contains direct UsersView items', () => {
    const raw: Partial<UsersView>[] = [
      { userName: 'direct_user_1', flagName: 'FR' },
      { userName: 'direct_user_2', flagName: 'JP' },
    ]

    const users = extractLobbyUsers(raw)
    expect(users.length).toBe(2)
    expect(users[0].userName).toBe('direct_user_1')
    expect(users[1].userName).toBe('direct_user_2')
  })

  it('returns empty array when raw is null, undefined, or empty', () => {
    expect(extractLobbyUsers(null)).toEqual([])
    expect(extractLobbyUsers(undefined)).toEqual([])
    expect(extractLobbyUsers([])).toEqual([])
    expect(extractLobbyUsers({})).toEqual([])
  })
})
